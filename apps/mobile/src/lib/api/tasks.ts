import { fetchWithAuth } from './client';
import { buildUrlWithQuery, type StepFormAnswers } from '@hbcfield/shared/client';
import type { CrewView, JobTimeView, MyHandovers, TaskHandover, StepSubmission, Task, Comment, TaskEvent, CreateTaskInput, UpdateTaskInput, OpenRoleTask, LocationUpdate, LocationResponse, LocationBatchUpdate, ChecklistItem } from './types';

export interface TasksListParams {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  includeNoDueDate?: boolean;
  page?: number;
  limit?: number;
  /**
   * Only the caller's own work — asked of the SERVER, not of a fetched page.
   *
   * Somebody who oversees the work sees the whole organization, so their own
   * task is one row among hundreds and may not even be in the page the app
   * fetches. Narrowing only: the server ANDs it with what the caller may see.
   */
  assignedToMe?: boolean;
}

// Tasks API
export const tasksApi = {
  list: async (params?: TasksListParams): Promise<Task[]> => {
    const url = buildUrlWithQuery('/tasks', params ?? {});
    return fetchWithAuth<Task[]>(url, { method: 'GET' });
  },

  /**
   * How many tasks there are, by status — plus how many are the caller's own.
   *
   * One cached call answers both scope badges. Counting rows the app has not
   * fetched is the only way a badge can be true: the list is paged, so anything
   * counted client-side is a count of the page, not of the work.
   */
  counts: async (): Promise<Record<string, number>> => {
    return fetchWithAuth<Record<string, number>>('/tasks/counts', { method: 'GET' });
  },

  getById: async (id: string): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}`, { method: 'GET' });
  },

  // `accuracy` travels with the fix: the arrival check widens its zone by it
  // rather than judging a fuzzy position as though it were exact.
  // `answers`: the step form's answers when the step moved into asks for them (see workflows/step-form).
  updateStatus: async (
    id: string,
    status: string,
    reason?: string,
    location?: { lat: number; lng: number; accuracy?: number },
    answers?: StepFormAnswers,
  ): Promise<Task> => {
    /*
      ⚠️ ONLY THE THREE FIELDS THE ENDPOINT TAKES. Callers hand over a whole
      status fix (with `fixAt` and `mocked` for the outbox), and spreading it
      sent those too — the server refuses unknown fields, so "Arrived" failed
      with "property fixAt should not exist".
    */
    const where = location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : {};
    return fetchWithAuth<Task>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason, ...where, ...(answers ? { answers } : {}) }),
    });
  },

  getComments: async (taskId: string): Promise<Comment[]> => {
    return fetchWithAuth<Comment[]>(`/tasks/${taskId}/comments`, { method: 'GET' });
  },

  addComment: async (taskId: string, content: string): Promise<Comment> => {
    return fetchWithAuth<Comment>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  /** A job's time — travel, working, blocked, per worker. */
  jobTime: async (taskId: string): Promise<JobTimeView> => fetchWithAuth<JobTimeView>(`/tasks/${taskId}/time`, { method: 'GET' }),

  /** My jobs in work, notes I owe, jobs paused on me — one read. */
  myHandovers: async (): Promise<MyHandovers> => fetchWithAuth<MyHandovers>('/tasks/handover/mine', { method: 'GET' }),

  /** A crew on one job — direct path for a build without the offline engine (offline/tasks/crew-actions.ts). */
  crew: async (taskId: string, action: 'join' | 'leave' | 'issue' | 'resume', body: Record<string, unknown> = {}): Promise<CrewView> =>
    fetchWithAuth<CrewView>(`/tasks/${taskId}/crew/${action}`, { method: 'POST', body: JSON.stringify(body) }),

  /** Hand THIS job's lead to somebody on its crew — for today, or for good. */
  changeLead: async (taskId: string, body: { toUserId: string; scope: 'TODAY' | 'PERMANENT'; reason?: string }): Promise<CrewView> =>
    fetchWithAuth<CrewView>(`/tasks/${taskId}/lead`, { method: 'PUT', body: JSON.stringify(body) }),

  /** Direct path for a build without the offline engine — see offline/tasks/task-actions.ts. */
  resumeWork: async (taskId: string): Promise<Task> => fetchWithAuth<Task>(`/tasks/${taskId}/resume`, { method: 'POST', body: '{}' }),

  writeHandover: async (taskId: string, body: { id?: string; note: string; attachmentIds?: string[] }): Promise<TaskHandover> =>
    fetchWithAuth<TaskHandover>(`/tasks/${taskId}/handover`, { method: 'POST', body: JSON.stringify(body) }),

  // ── A task open to a WORK role (shared tasks/role-pool.ts) ──
  /** Tasks open to a role I hold, in the workspace I hold it in — urgent first, then the longest waiting. */
  openForMe: async (): Promise<OpenRoleTask[]> => fetchWithAuth<OpenRoleTask[]>('/tasks/open-for-me', { method: 'GET' }),
  /** Take a place. Refused with ROLE_TASK_TAKEN (params.takers) when somebody was faster. */
  take: async (taskId: string): Promise<{ id: string; spotsLeft: number; waitedMinutes: number | null }> =>
    fetchWithAuth(`/tasks/${taskId}/take`, { method: 'POST', body: '{}' }),
  /** Hand it back to its role before the work starts; it is offered again. */
  returnToRole: async (taskId: string, reason?: string): Promise<void> =>
    fetchWithAuth<void>(`/tasks/${taskId}/return-to-role`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),

  declineTask: async (taskId: string): Promise<void> => {
    return fetchWithAuth<void>(`/tasks/${taskId}/decline`, {
      method: 'POST',
    });
  },

  create: async (input: CreateTaskInput): Promise<Task> => {
    return fetchWithAuth<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /*
    ⚠️ PUT, NOT PATCH. The gateway declares `@Put(':id')` and nothing answers
    `PATCH /tasks/:id` — every edit from the phone was a 404 that read as
    "Failed to update", with no change on the server.
  */
  update: async (id: string, input: UpdateTaskInput): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  assign: async (taskId: string, workerId: string): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${taskId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ workerId }),
    });
  },

  delete: async (id: string): Promise<void> => {
    return fetchWithAuth<void>(`/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Tick or untick one checklist item — `PATCH /tasks/:id/checklist/:itemId`.
   *
   * ⚠️ NOT QUEUED. There is no outbox operation for it, so it needs a signal;
   * the job page disables the boxes when the phone knows it has none rather
   * than pretending a tick was kept.
   */
  toggleChecklistItem: async (taskId: string, itemId: string, isCompleted: boolean): Promise<ChecklistItem> => {
    return fetchWithAuth<ChecklistItem>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isCompleted }),
    });
  },

  /**
   * Give a checklist item to somebody on the crew, take a free one, or give one
   * back (`assigneeId: null`). The server judges it (shared mayChangeChecklistOwner).
   * ⚠️ NOT QUEUED, like the tick.
   */
  setChecklistOwner: async (taskId: string, itemId: string, assigneeId: string | null): Promise<ChecklistItem> => {
    return fetchWithAuth<ChecklistItem>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId }),
    });
  },

  getTimeline: async (taskId: string): Promise<TaskEvent[]> => {
    return fetchWithAuth<TaskEvent[]>(`/tasks/${taskId}/timeline`, { method: 'GET' });
  },

  /**
   * The step forms this job was moved through — its reports, each with the
   * form as it was answered and signed links to its photos and signatures.
   * Kept by the response cache, like the service report.
   */
  getSubmissions: async (taskId: string): Promise<StepSubmission[]> => {
    const rows = await fetchWithAuth<unknown>(`/tasks/${taskId}/submissions`, { method: 'GET' });
    return Array.isArray(rows) ? (rows as StepSubmission[]) : [];
  },
};

// Tracking API - technician location updates
export const trackingApi = {
  updateLocation: async (data: LocationUpdate): Promise<LocationResponse> => {
    return fetchWithAuth<LocationResponse>('/tracking/location', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  // Flush a buffered burst of route points in one request (background tracker).
  updateLocationBatch: async (data: LocationBatchUpdate): Promise<LocationResponse> => {
    return fetchWithAuth<LocationResponse>('/tracking/location/batch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
