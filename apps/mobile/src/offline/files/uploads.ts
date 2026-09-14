import type { SyncOperationName } from '@hbcfield/shared/client';
import type { OutboxOp } from '../outbox/types';

/**
 * Operations that carry a file, and where to ask for its upload link.
 *
 * Adding one is adding a row: its confirm route must take the shared
 * `ConfirmUploadDto` body (`id`, `fileName`, `fileType`, `fileKey`), and its
 * presign route must return `{ uploadUrl, fileKey }`.
 */
const PRESIGN: Partial<Record<SyncOperationName, (params: Record<string, string>) => string | null>> = {
  'task.attachment': (p) => (p.taskId ? `/tasks/${encodeURIComponent(p.taskId)}/attachments/presign` : null),
};

/** The body every upload confirm takes. `fileKey` is filled in at send time. */
export interface UploadBody {
  id: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  fileKey?: string;
}

/** The presign path for an operation that carries a file, or null for one that does not. */
export function presignPathFor(op: Pick<OutboxOp, 'op' | 'payload'>): string | null {
  const route = PRESIGN[op.op];
  return route ? route(op.payload.params ?? {}) : null;
}

export function carriesFile(op: Pick<OutboxOp, 'op'>): boolean {
  return PRESIGN[op.op] !== undefined;
}

export function uploadBodyOf(op: Pick<OutboxOp, 'payload'>): UploadBody {
  return (op.payload.body ?? {}) as UploadBody;
}
