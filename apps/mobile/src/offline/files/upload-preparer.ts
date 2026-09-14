import type { OperationPreparer, PrepareResult } from '../sync-engine';
import type { OutboxOp } from '../outbox/types';
import { UploadFailure, type FileDisk, type FileRegistry, type ObjectUploader } from './types';
import { heldFileIdOf, pendingFileIdOf, routeFor } from './uploads';

/**
 * Uploads an operation's file just before the operation is sent.
 *
 *   photo kept on phone ──► presign (now, so the link is fresh)
 *                       ──► PUT to storage ──► key saved on the file row
 *                       ──► the operation sent through /sync/push with that key
 *                       ──► accepted ──► local copy deleted
 *
 * The link is asked for at send time, not at the tap: a link made in a
 * basement at 9:00 has expired by the time the van reaches signal at 14:00.
 * The key is saved the moment the PUT succeeds, so an operation that fails
 * after it is retried without uploading the photo again.
 *
 * How a key fits a body is each route's business (see uploads.ts).
 */
export class FileUploadPreparer implements OperationPreparer {
  constructor(
    private readonly deps: {
      files: FileRegistry;
      disk: Pick<FileDisk, 'remove'>;
      uploader: ObjectUploader;
      /** False while the member wants photos sent only on Wi-Fi and this is not Wi-Fi. */
      mayUpload?: () => boolean;
    },
  ) {}

  needsPreparation(op: OutboxOp): boolean {
    return !!pendingFileIdOf(op);
  }

  async prepare(op: OutboxOp): Promise<PrepareResult> {
    const route = routeFor(op);
    const fileId = pendingFileIdOf(op);
    if (!route || !fileId) return { ok: true, op };

    const presignPath = route.presign(op.payload.params ?? {});
    if (!presignPath) return { ok: false, status: 400, code: 'UPLOAD_ROUTE_INVALID' };

    const file = await this.deps.files.get(fileId);
    // Nothing to send and nothing that will ever appear — refuse it so the
    // member sees it, rather than retrying forever.
    if (!file) return { ok: false, status: 422, code: 'FILE_MISSING' };

    const body = (op.payload.body ?? {}) as Record<string, unknown>;
    let key = file.objectKey;
    if (!key && this.deps.mayUpload && !this.deps.mayUpload()) {
      // Waits without counting as a failure; Wi-Fi arriving wakes the engine sooner.
      return { ok: false, hold: true, code: 'WAITING_FOR_WIFI', retryInMs: 5 * 60_000 };
    }
    if (!key) {
      try {
        const link = await this.deps.uploader.presign(presignPath, route.presignBody(file, route.fileNameOf(body)));
        await this.deps.uploader.put(link.uploadUrl, file.path, file.mime);
        await this.deps.files.markUploaded(file.id, link.fileKey);
        key = link.fileKey;
      } catch (err) {
        return err instanceof UploadFailure
          ? { ok: false, status: err.status, code: err.code }
          : { ok: false, status: null, code: 'UPLOAD_FAILED' };
      }
    }
    return { ok: true, op: { ...op, payload: { ...op.payload, body: route.withKey(body, key, file) } } };
  }

  async release(ops: readonly OutboxOp[]): Promise<void> {
    for (const op of ops) {
      const id = heldFileIdOf(op);
      if (!id) continue;
      const file = await this.deps.files.get(id);
      if (!file) continue;
      // Bytes first: a row without bytes is noticed, bytes without a row are not.
      await this.deps.disk.remove(file.path);
      await this.deps.files.remove(id);
    }
  }
}
