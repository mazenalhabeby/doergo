import { Inject, Injectable, Logger } from '@nestjs/common';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';

/**
 * Public images: avatars and portal cover images.
 *
 * They used to be written to the gateway's own filesystem and served by
 * `express.static`, which pins the gateway to one replica — whichever container
 * handled the upload is the only one that can serve it back. New uploads go to
 * object storage, which every replica can read.
 *
 * PUBLIC-READ, deliberately: these render in `<img>` tags from URLs stored in
 * the database. Anything genuinely private (site photos, receipts, documents)
 * is served through short-lived signed links instead — never through here.
 *
 * A thin facade over the shared ObjectStore: this class decides what is public;
 * the store decides how that is done on the current provider (an object ACL on
 * Hetzner, a separate public bucket on R2).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(OBJECT_STORE) private readonly store: ObjectStore | null) {
    // No credentials → callers fall back to local disk, so a deployment that
    // has not been given keys yet behaves exactly as before.
    if (!this.store) {
      this.logger.warn('S3 is not configured — uploads will fall back to local disk (single-replica only)');
    }
  }

  get isConfigured(): boolean {
    return this.store !== null;
  }

  /**
   * Store a publicly readable image and return its absolute URL.
   *
   * `key` must already be safe — callers build it from an id they control plus
   * an extension derived from the MIME type, never from the uploaded filename.
   */
  async uploadPublicImage(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!this.store) throw new Error('S3 is not configured');
    return this.store.putPublic(key, body, contentType);
  }

  /**
   * Delete a previously stored public image, given the URL we handed out.
   *
   * Ignores anything that is not ours — including the legacy `/uploads/...`
   * paths, which are files on disk and are removed by the caller instead. Never
   * fails the user's action: an orphaned object costs a fraction of a cent.
   */
  async deleteByUrl(url: string | null | undefined): Promise<void> {
    if (!this.store || !url) return;
    const deleted = await this.store.deletePublicByUrl(url);
    if (!deleted && this.store.keyFromUrl(url)) {
      this.logger.warn(`Could not delete public image ${url}`);
    }
  }
}
