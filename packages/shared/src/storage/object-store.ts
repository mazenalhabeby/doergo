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

import { createHash } from 'node:crypto';
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
  return {
    endpoint: env.S3_ENDPOINT ?? 'https://hel1.your-objectstorage.com',
    region: env.S3_REGION ?? 'eu-central',
    bucket: env.S3_BUCKET ?? 'hbcfield',
    accessKeyId,
    secretAccessKey,
  };
}

export class ObjectStore {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(config: ObjectStoreConfig) {
    this.bucket = config.bucket;
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
    contentLength: number,
    ttlSeconds = UPLOAD_URL_TTL_SECONDS,
  ): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: ttlSeconds },
    );
    return {
      url,
      key,
      headers: { 'Content-Type': contentType, 'Content-Length': String(contentLength) },
      expiresInSeconds: ttlSeconds,
    };
  }

  /**
   * A short-lived link to read one object.
   *
   * `downloadName` sets Content-Disposition so the browser saves
   * "Payslip August 2026.pdf" rather than a 64-character hash — the key is
   * content-addressed and means nothing to a person.
   */
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
