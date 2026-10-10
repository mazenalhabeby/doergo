import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { ChecklistItem, Comment, CreateTaskInput, CrewView, JobTimeReport, JobTimeView, OnBehalf, OpenRoleTask, RoleOption, RolePreview, RoleStats, StatusCountsResponse, Task, TaskAssignee, TaskDependency, TaskEvent, TaskHandover, TaskResponse, TaskStepSubmission, TasksListResponse, TasksQueryParams, UpdateTaskInput } from './types/tasks';
import { tasksEndpoints, type ClientCopyOption, type StepFormAnswers, type TaskReport, type TaskReportCopy } from '@hbcfield/shared/client';

export const tasksApi = {
  // Get task counts grouped by status
  /** Task counts grouped by status (default) or by space, over everything the
   *  caller may see — not just the loaded page. */
  getStatusCounts: async (params?: { groupBy?: 'status' | 'space'; spaceId?: string }) => {
    const response = await call(tasksEndpoints.counts, undefined, { query: { groupBy: params?.groupBy, spaceId: params?.spaceId } }) as ApiResponse<StatusCountsResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || {};
  },

  // Get all tasks with optional filters
  list: async (params?: TasksQueryParams) => {

    const response = await call(tasksEndpoints.list, undefined, { query: {
      status: params?.status !== 'all' ? params?.status : undefined,
      // The server filters on these; doing it in the browser only ever filtered
      // the page that happened to be loaded.
      statuses: params?.statuses?.length ? params.statuses.join(',') : undefined,
      search: params?.search?.trim() || undefined,
      sprintId: params?.sprintId !== 'all' ? params?.sprintId : undefined,
      epicId: params?.epicId !== 'all' ? params?.epicId : undefined,
      priority: params?.priority !== 'all' ? params?.priority : undefined,
      page: params?.page,
      limit: params?.limit,
      // The server scopes to this space (incl. cross-org shared spaces).
      spaceId: params?.spaceId,
      customerId: params?.customerId,
      unitId: params?.unitId,
      assignedToMe: params?.assignedToMe ? 'true' : undefined,
    } }) as ApiResponse<TasksListResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Get a single task by ID
  getById: async (id: string) => {
    const response = await call(tasksEndpoints.get, { id }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Create a new task
  create: async (input: CreateTaskInput) => {
    const response = await call(tasksEndpoints.create, undefined, { body: input }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update a task
  update: async (id: string, input: UpdateTaskInput) => {
    const response = await call(tasksEndpoints.update, { id }, { body: input }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Delete a task
  delete: async (id: string) => {
    const response = await call(tasksEndpoints.remove, { id }) as ApiResponse<{ success: boolean; message: string }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Assign a task to an employee (DISPATCHER only)
  assign: async (id: string, workerId: string) => {
    const response = await call(tasksEndpoints.assign, { id }, { body: { workerId } }) as ApiResponse<TaskResponse>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update task status (TECHNICIAN only)
  updateStatus: async (id: string, status: string, reason?: string, answers?: StepFormAnswers, onBehalf?: OnBehalf) => {
    const response = await call(tasksEndpoints.setStatus, { id }, { body: {
      status,
      reason,
      // Only when the step asked something — see `useStepMove`.
      ...(answers !== undefined ? { answers } : {}),
      // The office starting somebody's job for them — see `useOfficeStart`.
      ...(onBehalf ? { onBehalf } : {}),
    } }) as ApiResponse<TaskResponse>;

    // Coded: a step-form refusal (STEP_FORM_INVALID / _FOREIGN_FILE) names the
    // fields it refused, and the move dialog shows each one where it belongs.
    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

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
  rolePreview: async (q: { spaceId: string; roleId: string; lat?: number | null; lng?: number | null }): Promise<RolePreview | undefined> => {
    const response = await call(tasksEndpoints.rolePreview, { ...q, lat: q.lat ?? undefined, lng: q.lng ?? undefined }) as ApiResponse<{ success: boolean; data: RolePreview }>;
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
    const response = await call(tasksEndpoints.take, { id }, { body: {} }) as ApiResponse<{ success: boolean; data: { id: string; spotsLeft: number; waitedMinutes: number | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
  /** Hand a role task back to its role (before the work starts); it is offered again. */
  returnToRole: async (id: string, reason?: string) => {
    const response = await call(tasksEndpoints.returnToRole, { id }, { body: reason ? { reason } : {} }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
  /** Open to a role, change how many it needs, or close it (roleId null). */
  setOpenRole: async (id: string, body: { roleId: string | null; spots?: number }) => {
    const response = await call(tasksEndpoints.setOpenRole, { id }, { body: body }) as ApiResponse<{ success: boolean; data: { id: string; openRoleId: string | null; openSpots?: number; openSpotsLeft?: number } }>;
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
  changeLead: async (id: string, body: { toUserId: string; scope: "TODAY" | "PERMANENT"; reason?: string }): Promise<CrewView | undefined> => {
    const response = await call(tasksEndpoints.changeLead, { id }, { body: body }) as ApiResponse<{ success: boolean; data: CrewView }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** The office joining or taking somebody off a crew job, with the reason the history keeps. */
  crewForMember: async (id: string, action: "join" | "leave", body: { forUserId: string; reason: string }): Promise<CrewView | undefined> => {
    const response = await call(tasksEndpoints.crew, { id, action }, { body: body }) as ApiResponse<{ success: boolean; data: CrewView }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** One worker's job time over a period, beside their time on the clock. */
  jobTimeReport: async (params: { userId?: string; from: string; to: string }): Promise<JobTimeReport | undefined> => {
    const response = await call(tasksEndpoints.jobTimeReport, { from: params.from, to: params.to, userId: params.userId || undefined }) as ApiResponse<{ success: boolean; data: JobTimeReport }>;
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
    const response = await call(tasksEndpoints.writeHandover, { id }, { body: { note } }) as ApiResponse<{ success: boolean; data: TaskHandover }>;
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
  getFullReport: async (id: string, copy: TaskReportCopy, include: readonly ClientCopyOption[] = [], issuer: string | null = null): Promise<TaskReport> => {
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

  // Get task timeline/activity
  getTimeline: async (id: string) => {
    const response = await call(tasksEndpoints.timeline, { id }) as ApiResponse<{ success: boolean; data: TaskEvent[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Add a comment to a task
  addComment: async (taskId: string, content: string) => {
    const response = await call(tasksEndpoints.addComment, { id: taskId }, { body: { content } }) as ApiResponse<{ success: boolean; data: Comment }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // ── Assignees ──────────────────────────────────────────────────────────────
  addAssignee: async (taskId: string, userId: string, role?: string) => {
    const response = await call(tasksEndpoints.addAssignee, { id: taskId }, { body: { userId, role: role || 'MEMBER' } }) as ApiResponse<{ success: boolean; data: TaskAssignee }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeAssignee: async (taskId: string, userId: string) => {
    const response = await call(tasksEndpoints.removeAssignee, { id: taskId, userId }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // ── Checklist ─────────────────────────────────────────────────────────────
  addChecklistItem: async (taskId: string, text: string) => {
    const response = await call(tasksEndpoints.addChecklistItem, { id: taskId }, { body: { text } }) as ApiResponse<{ success: boolean; data: ChecklistItem }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateChecklistItem: async (
    taskId: string,
    itemId: string,
    data: { text?: string; isCompleted?: boolean; assigneeId?: string | null },
  ) => {
    const response = await call(tasksEndpoints.updateChecklistItem, { id: taskId, itemId }, { body: data }) as ApiResponse<{ success: boolean; data: ChecklistItem }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  deleteChecklistItem: async (taskId: string, itemId: string) => {
    const response = await call(tasksEndpoints.removeChecklistItem, { id: taskId, itemId }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // ── Subtasks ─────────────────────────────────────────────────────────────
  createSubtask: async (parentId: string, data: CreateTaskInput) => {
    const response = await call(tasksEndpoints.addSubtask, { id: parentId }, { body: data }) as ApiResponse<TaskResponse>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  getSubtasks: async (taskId: string) => {
    const response = await call(tasksEndpoints.subtasks, { id: taskId }) as ApiResponse<{ success: boolean; data: Task[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  // ── Dependencies ────────────────────────────────────────────────────────
  addDependency: async (taskId: string, predecessorId: string, type?: string, lagDays?: number) => {
    const response = await call(tasksEndpoints.addDependency, { id: taskId }, { body: { predecessorId, type, lagDays } }) as ApiResponse<{ success: boolean; data: TaskDependency }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeDependency: async (taskId: string, depId: string) => {
    const response = await call(tasksEndpoints.removeDependency, { id: taskId, depId }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
};
