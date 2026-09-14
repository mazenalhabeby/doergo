import type { OperationPreparer, PrepareResult } from '../sync-engine';
import type { OutboxOp } from '../outbox/types';
import { UploadFailure, type FileDisk, type FileRegistry, type ObjectUploader } from './types';
import { heldFileIdsOf, pendingFileIdOf, routeFor } from './uploads';

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
    if (!route || !pendingFileIdOf(op)) return { ok: true, op };

    const presignPath = route.presign(op.payload.params ?? {});
    if (!presignPath) return { ok: false, status: 400, code: 'UPLOAD_ROUTE_INVALID' };

    // An operation may carry more than one file (a card's front and back).
    let body = (op.payload.body ?? {}) as Record<string, unknown>;
    for (let fileId = route.pendingFileIdOf(body), guard = 0; fileId && guard < 5; fileId = route.pendingFileIdOf(body), guard++) {
      const file = await this.deps.files.get(fileId);
      // Nothing to send and nothing that will ever appear — refuse it so the
      // member sees it, rather than retrying forever.
      if (!file) return { ok: false, status: 422, code: 'FILE_MISSING' };

      let key = file.objectKey;
      if (!key && this.deps.mayUpload && !this.deps.mayUpload()) {
        // Waits without counting as a failure; Wi-Fi arriving wakes the engine sooner.
        return { ok: false, hold: true, code: 'WAITING_FOR_WIFI', retryInMs: 5 * 60_000 };
      }
      if (!key) {
        try {
          const answer = await this.deps.uploader.presign(presignPath, route.presignBody(file, route.fileNameOf(body), body));
          const link = route.linkOf ? route.linkOf(answer) : { uploadUrl: String(answer.uploadUrl), fileKey: String(answer.fileKey) };
          await this.deps.uploader.put(link.uploadUrl, file.path, file.mime);
          await this.deps.files.markUploaded(file.id, link.fileKey);
          key = link.fileKey;
        } catch (err) {
          return err instanceof UploadFailure
            ? { ok: false, status: err.status, code: err.code }
            : { ok: false, status: null, code: 'UPLOAD_FAILED' };
        }
      }
      body = route.withKey(body, key, file);
    }
    return { ok: true, op: { ...op, payload: { ...op.payload, body } } };
  }

  async release(ops: readonly OutboxOp[]): Promise<void> {
    for (const op of ops) {
      for (const id of heldFileIdsOf(op)) {
        const file = await this.deps.files.get(id);
        if (!file) continue;
        // Bytes first: a row without bytes is noticed, bytes without a row are not.
        await this.deps.disk.remove(file.path);
        await this.deps.files.remove(id);
      }
    }
  }
}
