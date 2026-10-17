/** The one S3 client: upload links, download links, reads, writes, deletes. */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  INLINE_SAFE_TYPES,
  MEDIA_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  contentDisposition,
  keyFromStoredUrl,
  type ObjectStoreConfig,
  type PresignedUpload,
} from './keys';

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
