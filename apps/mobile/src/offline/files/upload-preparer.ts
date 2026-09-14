import type { OperationPreparer, PrepareResult } from '../sync-engine';
import type { OutboxOp } from '../outbox/types';
import { UploadFailure, type FileDisk, type FileRegistry, type ObjectUploader } from './types';
import { carriesFile, presignPathFor, uploadBodyOf } from './uploads';

/**
 * Uploads an operation's file just before the operation is sent.
 *
 *   photo kept on phone ──► presign (now, so the link is fresh)
 *                       ──► PUT to storage ──► key saved on the file row
 *                       ──► confirm sent through /sync/push with that key
 *                       ──► accepted ──► local copy deleted
 *
 * The link is asked for at send time, not at the tap: a link made in a
 * basement at 9:00 has expired by the time the van reaches signal at 14:00.
 * The key is saved the moment the PUT succeeds, so a confirm that fails is
 * retried without uploading the photo again.
 */
export class FileUploadPreparer implements OperationPreparer {
  constructor(
    private readonly deps: {
      files: FileRegistry;
      disk: Pick<FileDisk, 'remove'>;
      uploader: ObjectUploader;
    },
  ) {}

  async prepare(op: OutboxOp): Promise<PrepareResult> {
    const presignPath = presignPathFor(op);
    if (!presignPath) {
      return carriesFile(op) ? { ok: false, status: 400, code: 'UPLOAD_ROUTE_INVALID' } : { ok: true, op };
    }
    const body = uploadBodyOf(op);
    if (body.fileKey) return { ok: true, op };

    const file = await this.deps.files.get(body.id);
    // Nothing to send and nothing that will ever appear — refuse it so the
    // member sees it, rather than retrying forever.
    if (!file) return { ok: false, status: 422, code: 'FILE_MISSING' };

    let key = file.objectKey;
    if (!key) {
      try {
        const link = await this.deps.uploader.presign(presignPath, { fileName: body.fileName, fileType: file.mime });
        await this.deps.uploader.put(link.uploadUrl, file.path, file.mime);
        await this.deps.files.markUploaded(file.id, link.fileKey);
        key = link.fileKey;
      } catch (err) {
        return err instanceof UploadFailure
          ? { ok: false, status: err.status, code: err.code }
          : { ok: false, status: null, code: 'UPLOAD_FAILED' };
      }
    }
    return {
      ok: true,
      op: {
        ...op,
        payload: { ...op.payload, body: { ...body, fileKey: key, fileType: file.mime, fileSize: file.bytes ?? body.fileSize } },
      },
    };
  }

  async release(ops: readonly OutboxOp[]): Promise<void> {
    for (const op of ops) {
      if (!carriesFile(op)) continue;
      const id = uploadBodyOf(op).id;
      if (!id) continue;
      const file = await this.deps.files.get(id);
      if (!file) continue;
      // Bytes first: a row without bytes is noticed, bytes without a row are not.
      await this.deps.disk.remove(file.path);
      await this.deps.files.remove(id);
    }
  }
}
