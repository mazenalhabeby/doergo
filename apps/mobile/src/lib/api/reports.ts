import { fetchWithAuth } from './client';
import type { CompleteTaskInput, ServiceReport } from './types';

// Reports API - completing tasks with service reports
export const reportsApi = {
  completeTask: async (taskId: string, input: CompleteTaskInput): Promise<ServiceReport> => {
    return fetchWithAuth<ServiceReport>(`/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

// Report Attachments API
export const reportAttachmentsApi = {
  getPresignedUrl: async (reportId: string, fileName: string, fileType: string): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number }> => {
    return fetchWithAuth(`/reports/${reportId}/attachments/presign`, {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType }),
    });
  },

  confirmUpload: async (reportId: string, data: { type: string; fileName: string; fileUrl: string; fileSize: number; caption?: string }): Promise<any> => {
    return fetchWithAuth(`/reports/${reportId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  delete: async (reportId: string, attachmentId: string): Promise<void> => {
    return fetchWithAuth<void>(`/reports/${reportId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
  },
};
