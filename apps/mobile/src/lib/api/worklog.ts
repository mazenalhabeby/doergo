import { fetchWithAuth } from './client';
import { path } from './path';

export interface WorkLogAttachment {
  id: string;
  fileKey: string;
  fileUrl: string;
  url?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  createdAt: string;
}

export interface WorkLogNote {
  id: string;
  timeEntryId: string;
  userId: string;
  body: string;
  at: string;
  taskId?: string | null;
  attachments: WorkLogAttachment[];
  createdAt: string;
  author?: { id: string; name: string }; // who wrote it (member or manager)
  byManager?: boolean; // true when a manager/admin wrote it, not the session's member
}

/**
 * Session work-log API. A member adds timestamped notes (optionally with photos)
 * during a clock-in session; at clock-out they compose "what I did today".
 * Photos upload phone→S3 direct via presign→PUT→confirm.
 */
// NOTE: fetchWithAuth already unwraps the `{ data: T }` envelope
// (`envelope.ts`), so these methods must NOT unwrap `.data` again.
export const worklogApi = {
  list: async (entryId: string): Promise<WorkLogNote[]> => {
    const res = await fetchWithAuth<WorkLogNote[]>(path`/attendance/entries/${entryId}/worklog`);
    return res ?? [];
  },

  addNote: async (entryId: string, input: { body: string; at?: string; taskId?: string }): Promise<WorkLogNote> => {
    return fetchWithAuth<WorkLogNote>(path`/attendance/entries/${entryId}/worklog`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Offline flush: many notes in one round-trip. */
  addNotesBatch: async (entryId: string, notes: Array<{ body: string; at?: string; taskId?: string }>): Promise<{ inserted: number }> => {
    return fetchWithAuth<{ inserted: number }>(path`/attendance/entries/${entryId}/worklog/batch`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  deleteNote: async (noteId: string): Promise<void> => {
    await fetchWithAuth<void>(path`/attendance/worklog/${noteId}`, { method: 'DELETE' });
  },

  presignAttachment: async (noteId: string, fileName: string, mimeType: string): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number }> => {
    return fetchWithAuth<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number }>(
      path`/attendance/worklog/${noteId}/attachments/presign`,
      { method: 'POST', body: JSON.stringify({ fileName, mimeType }) },
    );
  },

  confirmAttachment: async (
    noteId: string,
    data: { fileKey: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number; height?: number },
  ): Promise<WorkLogAttachment> => {
    return fetchWithAuth<WorkLogAttachment>(path`/attendance/worklog/${noteId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteAttachment: async (attachmentId: string): Promise<void> => {
    await fetchWithAuth<void>(path`/attendance/worklog/attachments/${attachmentId}`, { method: 'DELETE' });
  },
};
