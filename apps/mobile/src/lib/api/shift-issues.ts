import { fetchWithAuth } from './client';

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
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.scope) qs.set('scope', params.scope);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return (await fetchWithAuth<ShiftIssue[]>(`/shift-issues${suffix}`)) ?? [];
  },
  get: (id: string): Promise<ShiftIssue> => fetchWithAuth<ShiftIssue>(`/shift-issues/${id}`),
  create: (input: { title: string; description?: string; severity?: string; timeEntryId?: string; spaceId?: string }): Promise<ShiftIssue> =>
    fetchWithAuth<ShiftIssue>('/shift-issues', { method: 'POST', body: JSON.stringify(input) }),
  message: (id: string, input: { body?: string; attachments?: any[] }): Promise<ShiftIssueEvent> =>
    fetchWithAuth<ShiftIssueEvent>(`/shift-issues/${id}/messages`, { method: 'POST', body: JSON.stringify(input) }),
  acknowledge: (id: string): Promise<ShiftIssue> => fetchWithAuth<ShiftIssue>(`/shift-issues/${id}/acknowledge`, { method: 'POST', body: '{}' }),
  setStatus: (id: string, status: string, note?: string): Promise<ShiftIssue> =>
    fetchWithAuth<ShiftIssue>(`/shift-issues/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  presignAttachment: (id: string, fileName: string, mimeType: string): Promise<{ uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number }> =>
    fetchWithAuth(`/shift-issues/${id}/attachments/presign`, { method: 'POST', body: JSON.stringify({ fileName, mimeType }) }),
};

