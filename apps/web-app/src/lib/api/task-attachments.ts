import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Attachment } from './types/task-attachments';
import { tasksEndpoints } from '@hbcfield/shared/client';

// Task Attachments API (presigned URL upload flow)
export const taskAttachmentsApi = {
  getPresignedUrl: async (taskId: string, fileName: string, fileType: string) => {
    const response = await call(tasksEndpoints.attachmentPresign, { id: taskId }, { body: { fileName, fileType } }) as ApiResponse<{
      success: boolean;
      data: { uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number };
    }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data?.data;
  },

  confirmUpload: async (
    taskId: string,
    // `fileKey` is what the server stores; `fileUrl` is sent too so a server
    // that predates keys keeps accepting the upload.
    data: { fileName: string; fileKey?: string; fileUrl?: string; fileType: string; fileSize: number }
  ) => {
    const response = await call(tasksEndpoints.attachmentConfirm, { id: taskId }, { body: data }) as ApiResponse<{ success: boolean; data: Attachment }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data?.data;
  },

  getAttachments: async (taskId: string) => {
    const response = await call(tasksEndpoints.attachments, { id: taskId }) as ApiResponse<{ success: boolean; data: Attachment[] }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data?.data || [];
  },

  delete: async (taskId: string, attachmentId: string) => {
    const response = await call(tasksEndpoints.removeAttachment, { id: taskId, attachmentId }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) {
      throw apiError(response);
    }
    return response.data;
  },
};
