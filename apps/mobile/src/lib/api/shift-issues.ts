import { fetchWithAuth } from './client';
import { path } from './path';
import { buildUrlWithQuery } from '@hbcfield/shared/client';

// fetchWithAuth already unwraps the { data } envelope.
export type ShiftIssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELED';
export type ShiftIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface ShiftIssueEvent {
  id: string; type: string; actorId?: string | null; actorName?: string; body?: string | null;
  metadata?: any; attachments?: Array<{ id?: string; url?: string; fileUrl: string; fileName: string; mimeType: string }>; at: string;
}
export interface ShiftIssue {
  id: string; title: string; description?: string | null; severity: ShiftIssueSeverity; status: ShiftIssueStatus;
  reportedById: string; reporterName?: string; assignedToId?: string | null; assigneeName?: string | null;
  createdAt: string; updatedAt: string; eventCount?: number; thread?: ShiftIssueEvent[];
}

export const shiftIssuesApi = {
  list: async (params?: { status?: string; scope?: string }): Promise<ShiftIssue[]> => {
    return (await fetchWithAuth<ShiftIssue[]>(buildUrlWithQuery('/shift-issues', { status: params?.status, scope: params?.scope }))) ?? [];
  },
  get: (id: string): Promise<ShiftIssue> => fetchWithAuth<ShiftIssue>(path`/shift-issues/${id}`),
  create: (input: { title: string; description?: string; severity?: string; timeEntryId?: string; spaceId?: string }): Promise<ShiftIssue> =>
    fetchWithAuth<ShiftIssue>('/shift-issues', { method: 'POST', body: JSON.stringify(input) }),
  message: (id: string, input: { body?: string; attachments?: any[] }): Promise<ShiftIssueEvent> =>
    fetchWithAuth<ShiftIssueEvent>(path`/shift-issues/${id}/messages`, { method: 'POST', body: JSON.stringify(input) }),
  acknowledge: (id: string): Promise<ShiftIssue> => fetchWithAuth<ShiftIssue>(path`/shift-issues/${id}/acknowledge`, { method: 'POST', body: '{}' }),
  setStatus: (id: string, status: string, note?: string): Promise<ShiftIssue> =>
    fetchWithAuth<ShiftIssue>(path`/shift-issues/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  presignAttachment: (id: string, fileName: string, mimeType: string): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number }> =>
    fetchWithAuth(path`/shift-issues/${id}/attachments/presign`, { method: 'POST', body: JSON.stringify({ fileName, mimeType }) }),
};

