import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { WorkLogAttachment, WorkLogNote } from './types/worklog';
import { worklogEndpoints } from '@hbcfield/shared/client';

export const worklogApi = {
  list: async (entryId: string): Promise<WorkLogNote[]> => {
    const res = await call(worklogEndpoints.list, { entryId }) as ApiResponse<{ data: WorkLogNote[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  addNote: async (entryId: string, input: { body: string; at?: string; taskId?: string }): Promise<WorkLogNote> => {
    const res = await call(worklogEndpoints.add, { entryId }, { body: input }) as ApiResponse<{ data: WorkLogNote }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  deleteNote: async (noteId: string) => {
    const res = await call(worklogEndpoints.remove, { noteId }) as ApiResponse<{ data: { success: boolean } }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  presignAttachment: async (noteId: string, fileName: string, mimeType: string) => {
    const res = await call(
      worklogEndpoints.attachmentPresign,
      { noteId },
      {
        body: { fileName, mimeType }
      }) as ApiResponse<{ data: { uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number } }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  confirmAttachment: async (
    noteId: string,
    data: {
      fileKey: string;
      fileUrl: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      width?: number;
      height?: number
    }): Promise<WorkLogAttachment> => {
    const res = await call(worklogEndpoints.attachmentConfirm, { noteId }, { body: data }) as ApiResponse<{ data: WorkLogAttachment }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
};
