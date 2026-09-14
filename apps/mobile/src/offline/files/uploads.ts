import type { SyncOperationName } from '@hbcfield/shared/client';
import type { OutboxOp } from '../outbox/types';

/**
 * Operations that carry a file, and where to ask for its upload link.
 *
 * Adding one is adding a row: its confirm route must take `id`, `fileName`,
 * `fileKey` and the type under `typeField`, and its presign route must return
 * `{ uploadUrl, fileKey }`.
 */
interface UploadRoute {
  presign: (params: Record<string, string>) => string | null;
  /**
   * What the route calls the file's type. Task attachments use the shared
   * `fileType`; the work log has always said `mimeType`, and app 1.0.5 still
   * sends that, so the route keeps its name and this row says so.
   */
  typeField: 'fileType' | 'mimeType';
}

const ROUTES: Partial<Record<SyncOperationName, UploadRoute>> = {
  'task.attachment': {
    presign: (p) => (p.taskId ? `/tasks/${encodeURIComponent(p.taskId)}/attachments/presign` : null),
    typeField: 'fileType',
  },
  'worklog.attachment': {
    presign: (p) => (p.noteId ? `/attendance/worklog/${encodeURIComponent(p.noteId)}/attachments/presign` : null),
    typeField: 'mimeType',
  },
};

/** The body every upload confirm takes. `fileKey` is filled in at send time. */
export interface UploadBody {
  id: string;
  fileName: string;
  fileType?: string;
  mimeType?: string;
  fileSize?: number;
  fileKey?: string;
}

/** The presign path for an operation that carries a file, or null for one that does not. */
export function presignPathFor(op: Pick<OutboxOp, 'op' | 'payload'>): string | null {
  const route = ROUTES[op.op];
  return route ? route.presign(op.payload.params ?? {}) : null;
}

export function carriesFile(op: Pick<OutboxOp, 'op'>): boolean {
  return ROUTES[op.op] !== undefined;
}

/** The field this operation's route names the file type with. */
export function typeFieldFor(op: Pick<OutboxOp, 'op'>): UploadRoute['typeField'] {
  return ROUTES[op.op]?.typeField ?? 'fileType';
}

export function uploadBodyOf(op: Pick<OutboxOp, 'payload'>): UploadBody {
  return (op.payload.body ?? {}) as UploadBody;
}
