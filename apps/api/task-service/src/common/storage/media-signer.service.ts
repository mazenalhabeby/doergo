import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { OBJECT_STORE, ObjectStore } from '@hbcfield/shared/storage';

/** The minimum a stored file row needs to be served. */
export interface StoredFile {
  fileKey?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

/**
 * Turns stored file rows into what a client may see: a short-lived signed link.
 *
 * ⚠️ ONE place. Task attachments, report photos, work-log images and shift-issue
 * photos are returned by five different services, and each used to decide for
 * itself whether to sign, for how long, and whether to render inline. Two of
 * them returned the stored provider URL as-is, which only worked because the
 * bucket was publicly readable.
 *
 * `fileUrl` is REPLACED with the signed link (and mirrored as `url`): the web
 * app and app 1.0.5 already render `fileUrl`, so existing clients read private
 * objects without an update, and the bucket can stop being public.
 */
@Injectable()
export class MediaSigner {
  constructor(@Inject(OBJECT_STORE) private readonly store: ObjectStore | null) {}

  /** The object key behind a row, whichever era wrote it; null if not ours. */
  keyOf(row: StoredFile): string | null {
    if (row.fileKey) return row.fileKey;
    return this.store ? this.store.keyFromUrl(row.fileUrl) : null;
  }

  /**
   * One row, signed. A row with no resolvable key keeps no URL at all rather
   * than leaking the stored provider URL — and storage being unconfigured
   * (a developer machine) yields `url: null` instead of failing the whole read.
   */
  async sign<T extends StoredFile>(row: T): Promise<T & { fileUrl: string | null; url: string | null }> {
    const key = this.keyOf(row);
    if (!key || !this.store) return { ...row, fileUrl: null, url: null };
    const url = await this.store.mediaUrl(key, {
      fileName: row.fileName ?? undefined,
      contentType: row.mimeType ?? undefined,
    });
    return { ...row, fileUrl: url, url };
  }

  /** Many rows, signed concurrently. Signing is local HMAC work, not a request. */
  signAll<T extends StoredFile>(rows: readonly T[] | null | undefined) {
    return Promise.all((rows ?? []).map((r) => this.sign(r)));
  }
}

/** Global so any module can inject `MediaSigner` without re-importing storage. */
@Global()
@Module({
  providers: [MediaSigner],
  exports: [MediaSigner],
})
export class MediaSignerModule {}
