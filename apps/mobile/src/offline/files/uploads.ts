import type { SyncOperationName } from '@hbcfield/shared/client';
import type { OutboxOp } from '../outbox/types';
import type { StoredFile } from './types';

type Body = Record<string, unknown>;

/**
 * An operation that carries one file: where to ask for its upload link, and
 * how the uploaded key fits into the operation's body.
 *
 * Routes did not agree on names before the phone went offline — `fileType`,
 * `mimeType`, `receiptMime`; a key at the top or inside an attachments list —
 * and app 1.0.5 still sends each one's own shape, so the routes keep them. Each
 * row says how its route reads a file, and the uploader asks the row.
 *
 * Adding one is adding a row. Its presign route must return `{ uploadUrl, fileKey }`.
 */
export interface UploadRoute {
  /** The presign path, from the operation's params. Null when a param is missing. */
  presign(params: Record<string, string>): string | null;
  /** The body the presign route takes. */
  presignBody(file: StoredFile, fileName: string): Record<string, string>;
  /** The held file this operation still has to upload, if any. */
  pendingFileIdOf(body: Body): string | undefined;
  /** The file's name as the member chose it. */
  fileNameOf(body: Body): string;
  /** The body with the uploaded key (and the file's real type and size) filled in. */
  withKey(body: Body, key: string, file: StoredFile): Body;
  /** The held file an operation carried, before or after upload — for cleaning up. */
  heldFileIdOf(body: Body): string | undefined;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const enc = encodeURIComponent;

/** The common shape: the record's own id is the file id, `fileKey` at the top. */
function flat(presign: (p: Record<string, string>) => string | null, typeField: 'fileType' | 'mimeType'): UploadRoute {
  return {
    presign,
    presignBody: (file, fileName) => ({ fileName, [typeField]: file.mime }),
    pendingFileIdOf: (b) => (b.fileKey ? undefined : str(b.id)),
    fileNameOf: (b) => str(b.fileName) ?? 'file',
    withKey: (b, key, file) => ({ ...b, fileKey: key, [typeField]: file.mime, fileSize: file.bytes ?? b.fileSize }),
    heldFileIdOf: (b) => str(b.id),
  };
}

const ROUTES: Partial<Record<SyncOperationName, UploadRoute>> = {
  'task.attachment': flat((p) => (p.taskId ? `/tasks/${enc(p.taskId)}/attachments/presign` : null), 'fileType'),
  'report.attachment': flat((p) => (p.reportId ? `/reports/${enc(p.reportId)}/attachments/presign` : null), 'fileType'),
  'worklog.attachment': flat((p) => (p.noteId ? `/attendance/worklog/${enc(p.noteId)}/attachments/presign` : null), 'mimeType'),

  /*
    An expense, maybe with its receipt. The expense's own id is `entryId` (the
    route calls the asset `id`), and the receipt is `receiptKey`/`receiptMime`/
    `receiptName`. `receiptPending` marks one still to upload; it never
    reaches the server — the upload replaces it with the key.
  */
  'expense.submit': {
    presign: (p) => (p.assetId ? `/assets/${enc(p.assetId)}/expenses/presign` : null),
    presignBody: (file, fileName) => ({ fileName, mimeType: file.mime }),
    pendingFileIdOf: (b) => (b.receiptPending && !b.receiptKey ? str(b.entryId) : undefined),
    fileNameOf: (b) => str(b.receiptName) ?? 'receipt',
    withKey: (b, key, file) => {
      const { receiptPending: _pending, ...rest } = b;
      return { ...rest, receiptKey: key, receiptMime: file.mime, receiptName: str(b.receiptName) ?? 'receipt' };
    },
    heldFileIdOf: (b) => str(b.entryId),
  },

  /*
    A photo on a shift issue: one attachment in the message's list, sent as a
    message of its own. `photoPending`/`photoName`/`photoMime` are the phone's markers and
    are replaced by the attachment when it uploads.
  */
  'shiftIssue.message': {
    presign: (p) => (p.issueId ? `/shift-issues/${enc(p.issueId)}/attachments/presign` : null),
    presignBody: (file, fileName) => ({ fileName, mimeType: file.mime }),
    pendingFileIdOf: (b) => (b.photoPending ? str(b.id) : undefined),
    fileNameOf: (b) => str(b.photoName) ?? 'photo.jpg',
    withKey: (b, key, file) => {
      const { photoPending: _pending, photoName, photoMime: _mime, ...rest } = b;
      const attachment = {
        fileKey: key,
        fileName: str(photoName) ?? 'photo.jpg',
        mimeType: file.mime,
        ...(file.bytes ? { fileSize: file.bytes } : {}),
        ...(file.width ? { width: file.width } : {}),
        ...(file.height ? { height: file.height } : {}),
      };
      return { ...rest, attachments: [attachment] };
    },
    heldFileIdOf: (b) => str(b.id),
  },
};

export function routeFor(op: Pick<OutboxOp, 'op'>): UploadRoute | undefined {
  return ROUTES[op.op];
}

const bodyOf = (op: Pick<OutboxOp, 'payload'>) => (op.payload.body ?? {}) as Body;

/** The held file this operation still has to upload, if any. */
export function pendingFileIdOf(op: Pick<OutboxOp, 'op' | 'payload'>): string | undefined {
  return routeFor(op)?.pendingFileIdOf(bodyOf(op));
}

/** The held file an operation carried, for deleting its copy once it is done with. */
export function heldFileIdOf(op: Pick<OutboxOp, 'op' | 'payload'>): string | undefined {
  return routeFor(op)?.heldFileIdOf(bodyOf(op));
}
