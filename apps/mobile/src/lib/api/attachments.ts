import type { PresignedUpload } from '@hbcfield/shared/client';
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

// Upload file to presigned URL with progress tracking
export function uploadToPresignedUrl(
  url: string,
  fileUri: string,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send({ uri: fileUri, type: contentType, name: 'upload' } as any);
  });
}
