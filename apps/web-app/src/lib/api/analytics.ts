import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  DatasetMeta,
  ReportDefinition,
  ReportResult,
  ReportSchedule,
  ReportTemplate,
  SavedReport,
  ScheduleInput
} from './types/analytics';
import { analyticsWebEndpoints } from '@hbcfield/shared/client';

export const analyticsApi = {
  catalog: async () => {
    const res = await call(
      analyticsWebEndpoints.catalog) as ApiResponse<{ data: { datasets: DatasetMeta[]; templates: ReportTemplate[] } }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  run: async (definition: ReportDefinition) => {
    const res = await call(analyticsWebEndpoints.run, undefined, { body: { definition } }) as ApiResponse<{ data: ReportResult }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  timesheet: async (userId: string, params?: { from?: string; to?: string }) => {
    const res = await call(
      analyticsWebEndpoints.timesheet,
      undefined,
      { query: { userId, ...(params || {}) } }) as ApiResponse<{ data: ReportResult & { userName: string } }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  listSaved: async () => {
    const res = await call(analyticsWebEndpoints.listSaved) as ApiResponse<{ data: SavedReport[] }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  createSaved: async (input: { name: string; description?: string; config: ReportDefinition; isShared?: boolean }) => {
    const res = await call(analyticsWebEndpoints.createSaved, undefined, { body: input }) as ApiResponse<{ data: SavedReport }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  updateSaved: async (id: string, input: { name?: string; description?: string; config?: ReportDefinition; isShared?: boolean }) => {
    const res = await call(analyticsWebEndpoints.updateSaved, { id }, { body: input }) as ApiResponse<{ data: SavedReport }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  deleteSaved: async (id: string) => {
    const res = await call(analyticsWebEndpoints.deleteSaved, { id }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  // ── Scheduled delivery ──
  listSchedules: async (reportId?: string) => {
    const res = await call(
      analyticsWebEndpoints.listSchedules,
      undefined,
      { query: { reportId: reportId || undefined } }) as ApiResponse<{ data: ReportSchedule[] }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  createSchedule: async (input: ScheduleInput) => {
    const res = await call(analyticsWebEndpoints.createSchedule, undefined, { body: input }) as ApiResponse<{ data: ReportSchedule }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  deleteSchedule: async (id: string) => {
    const res = await call(analyticsWebEndpoints.deleteSchedule, { id }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
};
