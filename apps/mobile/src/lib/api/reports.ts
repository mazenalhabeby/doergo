import { fetchWithAuth } from './client';
import type { CompleteTaskInput, ServiceReport } from './types';

// Reports API - completing tasks with service reports
export const reportsApi = {
  /**
   * The service report a finished job was closed with — `GET /tasks/:id/report`.
   *
   * ⚠️ The server answers `{ data: null }` when there is none, and the client
   * unwraps `data ?? envelope` — so "no report" arrives as the ENVELOPE, not
   * as null. Anything without a summary is no report.
   */
  getByTask: async (taskId: string): Promise<ServiceReport | null> => {
    const result = await fetchWithAuth<unknown>(`/tasks/${taskId}/report`, { method: 'GET' });
    const r = result as Partial<ServiceReport> | null;
    return r && typeof r === 'object' && typeof r.summary === 'string' ? (r as ServiceReport) : null;
  },

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

  confirmUpload: async (reportId: string, data: { type: string; fileName: string; fileKey?: string; fileUrl?: string; fileType?: string; fileSize?: number; caption?: string }): Promise<any> => {
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
