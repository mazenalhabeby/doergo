import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  CrewView,
  JobTimeReport,
  JobTimeView,
  OpenRoleTask,
  RoleOption,
  RolePreview,
  RoleStats,
  TaskHandover,
  TaskResponse,
  TaskStepSubmission,
} from './types/tasks';
import {
  tasksEndpoints,
  type ClientCopyOption,
  type TaskReport,
  type TaskReportCopy,
} from '@hbcfield/shared/client';

/**
 * Working a task: job time, an open role, the crew lead, resuming, the hand-over, step answers, the full report. Part of `tasksApi`,
 * moved here unchanged.
 */
export const taskWorkApi = {
  /** A job's time: travel, working, blocked — per worker, and who started it. */
  jobTime: async (id: string): Promise<JobTimeView | undefined> => {
    const response = await call(tasksEndpoints.time, { id }) as ApiResponse<{ success: boolean; data: JobTimeView }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // ── A task open to a WORK role (shared tasks/role-pool.ts) ──

  /** The work roles a task in this workspace can be opened to, with how many hold each. */
  roleOptions: async (spaceId: string): Promise<RoleOption[]> => {
    const response = await call(tasksEndpoints.roleOptions, { spaceId }) as ApiResponse<{ success: boolean; data: RoleOption[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },
  /** Before saving: who holds the role here, who is free now, the best ten. */
  rolePreview: async (
    q: { spaceId: string; roleId: string; lat?: number | null; lng?: number | null }): Promise<RolePreview | undefined> => {
    const response = await call(
      tasksEndpoints.rolePreview,
      { ...q, lat: q.lat ?? undefined, lng: q.lng ?? undefined }) as ApiResponse<{ success: boolean; data: RolePreview }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  /** Tasks open to a role the caller holds, in the workspace they hold it in. */
  openForMe: async (): Promise<OpenRoleTask[]> => {
    const response = await call(tasksEndpoints.openForMe) as ApiResponse<{ success: boolean; data: OpenRoleTask[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },
  /** Take a place — refused with ROLE_TASK_TAKEN (params.takers) when somebody was faster. */
  take: async (id: string): Promise<{ id: string; spotsLeft: number; waitedMinutes: number | null } | undefined> => {
    const response = await call(
      tasksEndpoints.take,
      { id },
      { body: {} }) as ApiResponse<{ success: boolean; data: { id: string; spotsLeft: number; waitedMinutes: number | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  /** Hand a role task back to its role (before the work starts); it is offered again. */
  returnToRole: async (id: string, reason?: string) => {
    const response = await call(
      tasksEndpoints.returnToRole,
      { id },
      { body: reason ? { reason } : {} }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
  /** Open to a role, change how many it needs, or close it (roleId null). */
  setOpenRole: async (id: string, body: { roleId: string | null; spots?: number }) => {
    const response = await call(
      tasksEndpoints.setOpenRole,
      { id },
      {
        body: body
      }) as ApiResponse<{ success: boolean; data: { id: string; openRoleId: string | null; openSpots?: number; openSpotsLeft?: number } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  /** Per role: opened, taken, average minutes to take, open now, overdue, who takes most. */
  roleStats: async (q: { spaceId?: string; from?: string; to?: string } = {}): Promise<RoleStats | undefined> => {
    const response = await call(tasksEndpoints.roleStats, q) as ApiResponse<{ success: boolean; data: RoleStats }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** Hand THIS job's lead to somebody on its crew — for today, or for good. */
  changeLead: async (
    id: string,
    body: { toUserId: string; scope: "TODAY" | "PERMANENT"; reason?: string }): Promise<CrewView | undefined> => {
    const response = await call(tasksEndpoints.changeLead, { id }, { body: body }) as ApiResponse<{ success: boolean; data: CrewView }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** The office joining or taking somebody off a crew job, with the reason the history keeps. */
  crewForMember: async (
    id: string,
    action: "join" | "leave",
    body: { forUserId: string; reason: string }): Promise<CrewView | undefined> => {
    const response = await call(tasksEndpoints.crew, { id, action }, { body: body }) as ApiResponse<{ success: boolean; data: CrewView }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** One worker's job time over a period, beside their time on the clock. */
  jobTimeReport: async (params: { userId?: string; from: string; to: string }): Promise<JobTimeReport | undefined> => {
    const response = await call(
      tasksEndpoints.jobTimeReport,
      { from: params.from, to: params.to, userId: params.userId || undefined }) as ApiResponse<{ success: boolean; data: JobTimeReport }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** "Resume work" on a job paused at a clock-out. Coded refusal: the clock gate. */
  resumeWork: async (id: string) => {
    const response = await call(tasksEndpoints.resume, { id }, { body: {} }) as ApiResponse<TaskResponse>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** "What I did, and what is left." */
  writeHandover: async (id: string, note: string): Promise<TaskHandover | undefined> => {
    const response = await call(
      tasksEndpoints.writeHandover,
      { id },
      { body: { note } }) as ApiResponse<{ success: boolean; data: TaskHandover }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** The step forms answered on this job (its reports), oldest first, with signed file links. */
  getSubmissions: async (id: string): Promise<TaskStepSubmission[]> => {
    const response = await call(tasksEndpoints.submissions, { id }) as ApiResponse<{ success: boolean; data: TaskStepSubmission[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? [];
  },

  /**
   * The job report — one job start to finish (shared tasks/task-report.ts).
   * The CLIENT copy is cut on the server; this only says which copy to send and
   * what the office chose to add back to it (`?include=`).
   * The thrown error carries `status` so a 404 can say "not available".
   */
  getFullReport: async (
    id: string,
    copy: TaskReportCopy,
    include: readonly ClientCopyOption[] = [],
    issuer: string | null = null): Promise<TaskReport> => {
    const response = await call(tasksEndpoints.fullReport, { id }, { query: {
        copy,
        // What the office adds back to the client copy; the office copy ignores it.
        include: copy === 'client' && include.length ? [...include].sort().join(',') : undefined,
        // "Issued by": a company from `meta.issuers`; absent = the automatic rule.
        issuer: issuer || undefined,
      } }) as ApiResponse<{ success: boolean; data: TaskReport }>;
    if (response.error || !response.data?.data) {
      const err = apiError(response.error ? response : { error: 'Request failed' }) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    return response.data.data;
  },
};
