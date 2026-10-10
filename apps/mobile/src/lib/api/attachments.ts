import { putToPresignedUrl, type PresignedUpload } from '@hbcfield/shared/client';
import { call, E } from './client';

// Task Attachments API
export const taskAttachmentsApi = {
  getPresignedUrl: async (taskId: string, fileName: string, fileType: string): Promise<PresignedUpload & { fileUrl: string }> => {
    return call(E.tasks.attachmentPresign, { id: taskId }, { body: { fileName, fileType } });
  },

  confirmUpload: async (taskId: string, data: { fileName: string; fileKey?: string; fileUrl?: string; fileType: string; fileSize?: number }): Promise<any> => {
    return call(E.tasks.attachmentConfirm, { id: taskId }, { body: data });
  },

  getAttachments: async (taskId: string): Promise<any[]> => {
    return call(E.tasks.attachments, { id: taskId });
  },

  delete: async (taskId: string, attachmentId: string): Promise<void> => {
    return call(E.tasks.removeAttachment, { id: taskId, attachmentId });
  },
};

// Upload file to presigned URL with progress tracking. The PUT itself is the
// shared one (web and phone); only React Native's file descriptor is ours.
export function uploadToPresignedUrl(
  url: string,
  fileUri: string,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return putToPresignedUrl(url, { uri: fileUri, type: contentType, name: 'upload' }, contentType, onProgress);
}
