/**
 * The one object store.
 *
 * Five places in this codebase build an S3 client: the gateway's StorageService
 * and the task service's worklog, attachments, shift-issues and reports
 * services. Each repeats the same endpoint/credential/path-style setup, and
 * each has drifted slightly from the others. This is the replacement.
 *
 * New code uses it. The four existing call sites are migrated afterwards, one
 * per change — reshaping an abstraction while a feature is still shaping it is
 * how a refactor takes a working system down with it.
 *
 * ── Two rules this class exists to enforce ──────────────────────────────────
 *
 * 1. BYTES NEVER PASS THROUGH THE API. Uploads and downloads are both presigned
 *    and go straight to object storage. A 40 MB PDF must never occupy a Node
 *    event loop that is also serving the dispatch board.
 *
 * 2. KEYS ARE CONTENT-ADDRESSED. `documentKey()` derives the key from the
 *    SHA-256 of the bytes, so identical files are stored once, the key cannot
 *    collide, and the key IS the integrity check — there is no separate hash to
 *    keep in sync with the object.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
  | 'covers';

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

export class ObjectStore {
  private readonly client: S3Client;
  readonly bucket: string;
  private readonly publicBucket: string;
  private readonly pathStyleBase: string;
  private readonly publicPathStyleBase: string;
  private readonly publicBase: string;
  private readonly knownBases: string[];
  private readonly supportsObjectAcl: boolean;

  constructor(config: ObjectStoreConfig) {
    this.bucket = config.bucket;
    this.publicBucket = config.publicBucket || config.bucket;
    const endpoint = config.endpoint.replace(/\/+$/, '');
    this.pathStyleBase = `${endpoint}/${config.bucket}`;
    this.publicPathStyleBase = `${endpoint}/${this.publicBucket}`;
    this.publicBase = (config.publicBaseUrl || this.publicPathStyleBase).replace(/\/+$/, '');
    // Every base a stored URL might begin with, current first.
    this.knownBases = [
      ...new Set([this.publicBase, this.publicPathStyleBase, this.pathStyleBase, ...(config.legacyBaseUrls ?? [])]),
    ];
    this.supportsObjectAcl = config.supportsObjectAcl ?? true;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Hetzner Object Storage is path-style; virtual-host style 404s there.
      forcePathStyle: true,
    });
  }

  /**
   * A link the client can PUT to directly.
   *
   * `contentType` and `contentLength` are signed into the URL, so a client that
   * announces a 2 MB PDF cannot then upload a 2 GB video: the store rejects the
   * mismatch. Without pinning both, a presigned upload URL is an open write
   * capability against the bucket for as long as it lives.
   */
  async presignUpload(
    key: string,
    contentType: string,
    /**
     * Pin the size when the client knows it exactly (documents do). Photo flows
     * pass `undefined`: a phone picker's reported size is not the bytes it
     * sends, and a mismatch fails the upload. Those flows verify the real size
     * with `head()` at confirm instead.
     */
    contentLength: number | undefined,
    ttlSeconds = UPLOAD_URL_TTL_SECONDS,
  ): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
      }),
      { expiresIn: ttlSeconds },
    );
    return {
      url,
      key,
      headers: {
        'Content-Type': contentType,
        ...(contentLength !== undefined ? { 'Content-Length': String(contentLength) } : {}),
      },
      expiresInSeconds: ttlSeconds,
    };
  }

  /**
   * The URL a PUBLIC object is read from. Only for objects stored with
   * `putPublic` — a private key given here yields a URL that 403s.
   */
  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  /**
   * The path-style URL of a PRIVATE object — `{endpoint}/{bucket}/{key}`.
   *
   * ⚠️ Not readable: the bucket is private. Exists only to keep writing the
   * legacy `fileUrl` columns that app 1.0.5 still sends back on confirm. New
   * code stores the key and signs a link with `mediaUrl`.
   */
  privateUrl(key: string): string {
    return `${this.pathStyleBase}/${key}`;
  }

  /**
   * The key inside a URL this store (or its predecessor) handed out, or null.
   * See `keyFromStoredUrl`.
   */
  keyFromUrl(url: string | null | undefined): string | null {
    return keyFromStoredUrl(url, this.knownBases);
  }

  /**
   * A short-lived read link for a work photo or file, rendered inline when the
   * type is inert. The one call every gallery uses, so the TTL and the
   * inline/attachment rule cannot drift between them.
   */
  async mediaUrl(key: string, opts: { fileName?: string; contentType?: string } = {}): Promise<string> {
    const inert = !!opts.contentType && INLINE_SAFE_TYPES.has(opts.contentType.toLowerCase());
    return this.presignDownload(key, opts.fileName, MEDIA_URL_TTL_SECONDS, {
      inline: inert,
      contentType: opts.contentType,
    });
  }

  /**
   * Store an object that anyone may read — an avatar, a logo.
   *
   * On a provider with object ACLs the object itself is made public; on one
   * without (R2), the public read comes from the bucket's custom domain, which
   * should expose only the public prefixes.
   */
  async putPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.publicBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(this.supportsObjectAcl ? { ACL: 'public-read' as const } : {}),
        // Every upload gets a fresh key, so the URL never changes meaning.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.publicUrl(key);
  }

  /**
   * Delete a public object given the URL `putPublic` returned.
   *
   * Takes a URL because that is what public rows hold. Anything that does not
   * resolve to one of our keys is ignored — a caller can never delete an
   * arbitrary object by storing an arbitrary URL. Never throws.
   */
  async deletePublicByUrl(url: string | null | undefined): Promise<boolean> {
    const key = this.keyFromUrl(url);
    if (!key) return false;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.publicBucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A short-lived link to one object.
   *
   * `inline` asks the browser to RENDER the file rather than save it, which is
   * what someone checking a payslip actually wants — saving a copy to look at
   * it, then deleting it, is a step nobody asked for.
   *
   * Only ever pass `inline` for a type that cannot execute. A PDF or a raster
   * image is inert; HTML and SVG are not, and rendering either inline would run
   * whatever the uploader put in it. The caller decides, because only the
   * caller knows which types it accepts.
   *
   * `contentType` travels with it: object storage will happily serve a PDF as
   * application/octet-stream, and a browser given that saves the file whatever
   * the disposition says.
   */
  async presignDownload(
    key: string,
    downloadName?: string,
    ttlSeconds = DOWNLOAD_URL_TTL_SECONDS,
    opts?: { inline?: boolean; contentType?: string },
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(downloadName
          ? {
              ResponseContentDisposition: contentDisposition(
                downloadName,
                opts?.inline ? 'inline' : 'attachment',
              ),
            }
          : {}),
        ...(opts?.contentType ? { ResponseContentType: opts.contentType } : {}),
      }),
      { expiresIn: ttlSeconds },
    );
  }

  /** Upload bytes we hold in memory — a rendered PDF, a signature image. */
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Content-addressed keys never change meaning, so they cache forever.
        CacheControl: 'private, max-age=31536000, immutable',
      }),
    );
  }

  /** Fetch an object's bytes. Used for hashing and for sealing a signed PDF. */
  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = res.Body as unknown as AsyncIterable<Uint8Array> | undefined;
    if (!body) throw new Error(`object ${key} has no body`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  /**
   * Whether an object exists, and how big it is.
   *
   * The confirm step after a presigned upload uses this: the client says it
   * uploaded, and this is how the server checks rather than believing it.
   */
  async head(key: string): Promise<{ exists: boolean; sizeBytes: number; contentType?: string }> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        exists: true,
        sizeBytes: res.ContentLength ?? 0,
        contentType: res.ContentType,
      };
    } catch {
      // Any failure to confirm is treated as absent. A confirm step that
      // assumed success on an ambiguous error would record a document row
      // pointing at nothing.
      return { exists: false, sizeBytes: 0 };
    }
  }

  /**
   * Remove an object.
   *
   * Never throws: cleanup failing must not fail the user's action. An orphaned
   * object costs a fraction of a cent.
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
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
