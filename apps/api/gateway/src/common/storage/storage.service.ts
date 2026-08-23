import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Where uploaded images actually live.
 *
 * They used to be written to the gateway's own filesystem and served by
 * `express.static`. A named Docker volume keeps them across redeploys, so this
 * is not a data-loss bug — but it does mean **the gateway cannot run more than
 * one replica**: whichever container handled the upload is the only one that can
 * serve it back, and every other replica returns 404. It also pins the service
 * to one host forever.
 *
 * So new uploads go to object storage, which every replica can read. The same
 * bucket the task service already uses for attachments — one bucket, one set of
 * credentials, one thing to rotate.
 *
 * PUBLIC-READ, deliberately: these are avatars and portal cover images rendered
 * in `<img>` tags whose URLs are stored in the database. A presigned URL expires
 * and would break every stored reference; today the files are already served
 * unauthenticated from `/uploads/`, so this changes nothing about who can see
 * what. Anything genuinely private belongs on the presigned path instead.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(private readonly config: ConfigService) {
    this.endpoint = this.config.get<string>('S3_ENDPOINT', 'https://hel1.your-objectstorage.com');
    this.bucket = this.config.get<string>('S3_BUCKET', 'hbcfield');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY', '');

    // No credentials → no client, and `isConfigured` is false. The callers fall
    // back to local disk rather than failing an upload, so a deployment that has
    // not been given keys yet behaves exactly as it did before.
    this.client = accessKeyId && secretAccessKey
      ? new S3Client({
          endpoint: this.endpoint,
          region: this.config.get<string>('S3_REGION', 'eu-central'),
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true,
        })
      : null;

    if (!this.client) {
      this.logger.warn('S3 is not configured — uploads will fall back to local disk (single-replica only)');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** The URL a browser will use. Path-style, matching `forcePathStyle`. */
  private urlFor(key: string): string {
    return `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${key}`;
  }

  /**
   * Store a publicly readable image and return its absolute URL.
   *
   * `key` must already be safe — callers build it from an id they control plus
   * an extension derived from the MIME type, never from the uploaded filename.
   */
  async uploadPublicImage(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!this.client) throw new Error('S3 is not configured');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
        // Immutable: every upload gets a new timestamped key, so the old URL is
        // never reused and a long cache can never serve a stale image.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.urlFor(key);
  }

  /**
   * Delete a previously stored object, given the URL we handed out.
   *
   * Ignores anything that is not ours — including the legacy `/uploads/...`
   * paths, which are files on disk and are removed by the caller instead.
   */
  async deleteByUrl(url: string | null | undefined): Promise<void> {
    if (!this.client || !url) return;
    const prefix = `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/`;
    if (!url.startsWith(prefix)) return;
    const key = url.slice(prefix.length);
    if (!key) return;
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // Never fail the user's action because cleanup failed — an orphaned
      // object costs a fraction of a cent; a failed profile update costs trust.
      this.logger.warn(`Could not delete ${key}: ${(err as Error).message}`);
    }
  }
}
