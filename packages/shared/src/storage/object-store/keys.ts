/** The store's settings, link lifetimes, how an object's key is made, and how a file is offered to the browser. */
import { createHash, randomUUID } from 'node:crypto';

export interface ObjectStoreConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Where PUBLIC objects (avatars, logos, portal covers) are read from.
   *
   * ⚠️ Not the endpoint. Provider hostnames were written into user rows, so
   * changing provider meant rewriting data. A base we own (a Cloudflare custom
   * domain in front of the bucket) survives a provider move; unset, it falls
   * back to the path-style bucket URL, which is what every existing row holds.
   */
  publicBaseUrl?: string;
  /**
   * The bucket PUBLIC objects are written to.
   *
   * ⚠️ On Cloudflare R2 public access is a property of the WHOLE bucket (a
   * custom domain or r2.dev exposes every key in it). Writing avatars into the
   * private bucket and giving it a public domain would publish every site photo
   * and receipt to anyone who learns a key. So public objects get their own
   * bucket there. On Hetzner, with per-object ACLs, it defaults to the main one,
   * which is today's behaviour.
   */
  publicBucket?: string;
  /**
   * Bases that USED to prefix stored URLs. Reading a key back out of an old
   * row (for a delete, or a signed read) must still work after a move.
   */
  legacyBaseUrls?: string[];
  /**
   * Whether the provider honours per-object ACLs. Hetzner does; Cloudflare R2
   * does not — public reads there come from the bucket's custom domain.
   */
  supportsObjectAcl?: boolean;
}

export interface PresignedUpload {
  url: string;
  key: string;
  /** Headers the client MUST send, or the signature will not match. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * How long a download link lives.
 *
 * Short on purpose. The link is minted at the moment someone opens a document
 * and is used immediately; a long TTL turns every audit entry into a capability
 * that outlives the act it recorded.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 60;

/**
 * How long an upload link lives. Longer than a download because the client has
 * to actually push the bytes over whatever connection a phone has in a plant
 * room, but still far short of a session.
 */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * How long a link to a work PHOTO lives — a task attachment, a report photo, a
 * work-log image.
 *
 * Longer than a document link because it is minted for a whole screen (a
 * gallery of twenty thumbnails) rather than for one deliberate "open", and a
 * dispatcher leaves that screen open. Short enough that a link copied out of the
 * browser is dead by the end of the morning. Documents keep their 60 s: opening
 * one is an audited act, a thumbnail is not.
 */
export const MEDIA_URL_TTL_SECONDS = 60 * 60;

/**
 * File extension for a MIME type we accept.
 *
 * Keys never carry the uploader's filename — it was the one guessable, and
 * occasionally identifying, part of a key ("1757849123000-passport_mueller.jpg").
 * The name lives in the row; the key is an id and an extension.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime?.toLowerCase?.() ?? ''] ?? 'bin';
}

/** A kind of stored object. The second segment of every key. */
export type ObjectKind =
  | 'attachments'
  | 'reports'
  | 'worklog'
  | 'shift-issues'
  | 'receipts'
  | 'proposals'
  | 'avatars'
  | 'logos'
  | 'covers'
  | 'chat';

/**
 * The key for anything that is not content-addressed.
 *
 * `{org}/{kind}/{parentId}/{uuid}.{ext}` — organization first so a tenant is a
 * prefix (export, deletion, lifecycle rules), the parent next so a task's files
 * are one listing, and a random id last so a key cannot be guessed from a
 * timestamp and a filename, which is what task attachments used to be.
 */
export function newObjectKey(params: {
  organizationId: string;
  kind: ObjectKind;
  parentId: string;
  mime: string;
}): string {
  const segment = (v: string) => {
    // Ids only. A slash or dot-dot here would let a caller write outside the
    // prefix every confirm step checks against.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(v)) throw new Error(`unsafe key segment: ${v}`);
    return v;
  };
  return `${segment(params.organizationId)}/${params.kind}/${segment(params.parentId)}/${randomUUID()}.${extensionForMime(params.mime)}`;
}

/**
 * Strip a known base off a stored URL and return the object key.
 *
 * Rows written before keys were stored hold `{endpoint}/{bucket}/{key}`. This
 * is the one place that knows how to read those. Returns null for anything that
 * is not ours — a legacy `/uploads/...` path on the gateway's disk, or a URL a
 * client made up — so a caller can never be tricked into deleting or signing an
 * arbitrary key by passing an arbitrary URL.
 */
export function keyFromStoredUrl(url: string | null | undefined, bases: readonly string[]): string | null {
  if (!url || typeof url !== 'string') return null;
  for (const raw of bases) {
    if (!raw) continue;
    const base = raw.replace(/\/+$/, '') + '/';
    if (url.startsWith(base)) {
      const path = url.slice(base.length).split('?')[0] ?? '';
      let key: string;
      try {
        key = decodeURIComponent(path);
      } catch {
        return null;
      }
      if (!key || key.includes('..') || key.startsWith('/')) return null;
      return key;
    }
  }
  return null;
}

/** SHA-256 of a buffer, lowercase hex. The identity of a stored object. */
export function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * The content-addressed key for a document.
 *
 * Scoped by organization first so a bucket policy or lifecycle rule can be
 * written per tenant, then fanned across 256 prefixes by the first byte of the
 * hash — object stores partition by key prefix, and a single flat prefix
 * holding every document in the system throttles once it is large.
 */
export function documentKey(organizationId: string, hash: string, extension: string): string {
  const ext = extension.replace(/^\.+/, '').toLowerCase();
  return `${organizationId}/documents/${hash.slice(0, 2)}/${hash}${ext ? `.${ext}` : ''}`;
}

/** The key for a captured signature image. Same addressing, separate prefix. */
export function signatureKey(organizationId: string, hash: string): string {
  return `${organizationId}/signatures/${hash.slice(0, 2)}/${hash}.png`;
}

/**
 * Reads store configuration from the environment.
 *
 * Returns null when credentials are absent, which is how a developer machine
 * with no keys behaves: callers degrade rather than crash on boot.
 */
export function objectStoreConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStoreConfig | null {
  const accessKeyId = env.S3_ACCESS_KEY ?? '';
  const secretAccessKey = env.S3_SECRET_KEY ?? '';
  if (!accessKeyId || !secretAccessKey) return null;
  /*
    ⚠️ `||`, not `??`. Compose passes `S3_ENDPOINT=${S3_ENDPOINT:-}`, so an unset
    variable arrives as the EMPTY STRING — which `??` keeps, producing a client
    pointed at "" that fails on the first request rather than at boot.
  */
  const endpoint = (env.S3_ENDPOINT || 'https://hel1.your-objectstorage.com').replace(/\/+$/, '');
  const bucket = env.S3_BUCKET || 'hbcfield';
  return {
    endpoint,
    region: env.S3_REGION || 'eu-central',
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBucket: env.S3_PUBLIC_BUCKET || bucket,
    publicBaseUrl: (env.S3_PUBLIC_BASE_URL || `${endpoint}/${env.S3_PUBLIC_BUCKET || bucket}`).replace(/\/+$/, ''),
    legacyBaseUrls: (env.S3_LEGACY_BASE_URLS || '')
      .split(',')
      .map((u) => u.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    supportsObjectAcl: (env.S3_OBJECT_ACL || 'true') !== 'false',
  };
}

/**
 * Types a browser may render inline without running anything.
 *
 * ⚠️ No SVG and no HTML: both execute. An uploaded SVG rendered inline from the
 * bucket origin is stored XSS.
 */
const INLINE_SAFE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/**
 * A Content-Disposition value that survives non-ASCII filenames.
 *
 * "Gehaltszettel Jänner.pdf" is a realistic name for this product, and a bare
 * `filename="…"` with a umlaut in it is not valid in an HTTP header — so the
 * ASCII-folded name goes in `filename` and the real one in `filename*`, which
 * is the RFC 5987 form every current browser prefers.
 */
export function contentDisposition(
  name: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): string {
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export { INLINE_SAFE_TYPES };
