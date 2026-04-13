import { fetchWithAuth } from './client';

// Task Attachments API
export const taskAttachmentsApi = {
  getPresignedUrl: async (taskId: string, fileName: string, fileType: string): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number }> => {
    return fetchWithAuth(`/tasks/${taskId}/attachments/presign`, {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType }),
    });
  },

  confirmUpload: async (taskId: string, data: { fileName: string; fileUrl: string; fileType: string; fileSize: number }): Promise<any> => {
    return fetchWithAuth(`/tasks/${taskId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getAttachments: async (taskId: string): Promise<any[]> => {
    return fetchWithAuth(`/tasks/${taskId}/attachments`);
  },

  delete: async (taskId: string, attachmentId: string): Promise<void> => {
    return fetchWithAuth<void>(`/tasks/${taskId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
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
