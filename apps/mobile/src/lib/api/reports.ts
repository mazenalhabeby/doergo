import { fetchWithAuth } from './client';
import type { ServiceReport } from './types';

/*
  Reports API — READ ONLY.

  A job is no longer closed with `POST /tasks/:id/complete`: a step's report is
  its step form, answered on the move itself (`PATCH /tasks/:id/status` with
  `answers`, see `workflows/step-form`). What stays is reading the service
  report an older job was closed with.
*/
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
};
