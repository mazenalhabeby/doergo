import { fetchWithAuth } from './client';

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
}

/**
 * Session work-log API. A member adds timestamped notes (optionally with photos)
 * during a clock-in session; at clock-out they compose "what I did today".
 * Photos upload phone→S3 direct via presign→PUT→confirm.
 */
export const worklogApi = {
  list: async (entryId: string): Promise<WorkLogNote[]> => {
    const res = await fetchWithAuth<{ data: WorkLogNote[] }>(`/attendance/entries/${entryId}/worklog`);
    return res?.data ?? [];
  },

  addNote: async (entryId: string, input: { body: string; at?: string; taskId?: string }): Promise<WorkLogNote> => {
    const res = await fetchWithAuth<{ data: WorkLogNote }>(`/attendance/entries/${entryId}/worklog`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  /** Offline flush: many notes in one round-trip. */
  addNotesBatch: async (entryId: string, notes: Array<{ body: string; at?: string; taskId?: string }>): Promise<{ inserted: number }> => {
    const res = await fetchWithAuth<{ data: { inserted: number } }>(`/attendance/entries/${entryId}/worklog/batch`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
    return res.data;
  },

  deleteNote: async (noteId: string): Promise<void> => {
    await fetchWithAuth<void>(`/attendance/worklog/${noteId}`, { method: 'DELETE' });
  },

  presignAttachment: async (noteId: string, fileName: string, mimeType: string): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number }> => {
    const res = await fetchWithAuth<{ data: { uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number } }>(
      `/attendance/worklog/${noteId}/attachments/presign`,
      { method: 'POST', body: JSON.stringify({ fileName, mimeType }) },
    );
    return res.data;
  },

  confirmAttachment: async (
    noteId: string,
    data: { fileKey: string; fileUrl: string; fileName: string; fileSize: number; mimeType: string; width?: number; height?: number },
  ): Promise<WorkLogAttachment> => {
    const res = await fetchWithAuth<{ data: WorkLogAttachment }>(`/attendance/worklog/${noteId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  deleteAttachment: async (attachmentId: string): Promise<void> => {
    await fetchWithAuth<void>(`/attendance/worklog/attachments/${attachmentId}`, { method: 'DELETE' });
  },
};
