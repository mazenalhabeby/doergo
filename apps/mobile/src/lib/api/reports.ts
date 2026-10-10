import { call, E } from './client';
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
   * The server answers `{ success, data: null }` when there is none, and the
   * client unwraps by SHAPE (`envelope.ts`), so "no report" arrives as null.
   * The summary check stays as a guard against a malformed row, not as the
   * way "none" is told apart from the envelope.
   */
  getByTask: async (taskId: string): Promise<ServiceReport | null> => {
    const r: Partial<ServiceReport> | null = await call(E.tasks.report, { id: taskId });
    return r && typeof r === 'object' && typeof r.summary === 'string' ? (r as ServiceReport) : null;
  },
};
