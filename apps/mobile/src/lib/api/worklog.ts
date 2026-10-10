import type { PresignedUpload, WorkLogAttachment, WorkLogNote } from '@hbcfield/shared/client';
import { call, E } from './client';

export type { WorkLogAttachment, WorkLogNote };

/**
 * Session work-log API. A member adds timestamped notes (optionally with photos)
 * during a clock-in session; at clock-out they compose "what I did today".
 * Photos upload phone→S3 direct via presign→PUT→confirm.
 */
// NOTE: the client already unwraps the `{ data: T }` envelope
// (`envelope.ts`), so these methods must NOT unwrap `.data` again.
export const worklogApi = {
  list: async (entryId: string): Promise<WorkLogNote[]> => {
    const res: WorkLogNote[] | null = await call(E.worklog.list, { entryId });
    return res ?? [];
  },

  addNote: async (entryId: string, input: { body: string; at?: string; taskId?: string }): Promise<WorkLogNote> => {
    return call(E.worklog.add, { entryId }, { body: input });
  },

  /** Offline flush: many notes in one round-trip. */
  addNotesBatch: async (entryId: string, notes: Array<{ body: string; at?: string; taskId?: string }>): Promise<{ inserted: number }> => {
    return call(E.worklog.addBatch, { entryId }, { body: { notes } });
  },

  deleteNote: async (noteId: string): Promise<void> => {
    await call(E.worklog.remove, { noteId });
  },

  presignAttachment: async (noteId: string, fileName: string, mimeType: string): Promise<PresignedUpload & { fileUrl: string }> => {
    return call(E.worklog.attachmentPresign, { noteId }, { body: { fileName, mimeType } });
  },

  confirmAttachment: async (
    noteId: string,
    data: { fileKey: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number; height?: number },
  ): Promise<WorkLogAttachment> => {
    return call(E.worklog.attachmentConfirm, { noteId }, { body: data });
  },

  deleteAttachment: async (attachmentId: string): Promise<void> => {
    await call(E.worklog.removeAttachment, { attachmentId });
  },
};
