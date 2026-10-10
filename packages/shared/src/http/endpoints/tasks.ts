/**
 * Tasks — the job itself, its crew, checklist, time, report and attachments.
 * Gateway: apps/api/gateway/src/modules/tasks/*.controller.ts, reports/*.
 */
import type { ChecklistItem, Comment, ServiceReport, Task, TaskEvent } from '../../types';
import type { StepFormAnswers } from '../../workflows/step-form';
import type { TaskReport } from '../../tasks/task-report';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';
import type { CrewView, JobTimeView, OpenRoleTask, PresignedUpload, TaskHandover } from '../types';

type Id = { id: string };

export interface TasksListQuery {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  includeNoDueDate?: boolean;
  page?: number;
  limit?: number;
  /** Only the caller's own work — narrowing only; the server ANDs it with what the caller may see. */
  assignedToMe?: boolean;
  spaceId?: string;
  priority?: string;
  assignedToId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: string | number | boolean | undefined;
}

export interface TaskStatusBody {
  status: string;
  reason?: string;
  lat?: number;
  lng?: number;
  /** The fix's accuracy — the arrival check widens its zone by it. */
  accuracy?: number;
  /** The step form's answers when the step moved into asks for them (workflows/step-form). */
  answers?: StepFormAnswers;
  onBehalf?: unknown;
}

export type CrewAction = 'join' | 'leave' | 'issue' | 'resume';

export interface ChecklistItemPatch {
  isCompleted?: boolean;
  title?: string;
  /** Somebody on THIS crew, or null to free it (shared tasks/checklist.ts). */
  assigneeId?: string | null;
}

export const tasksEndpoints = defineEndpoints('tasks', {
  list: endpoint<TasksListQuery | void, Task[]>({ method: 'GET', path: (q) => withQuery('/tasks', q || undefined) }),
  counts: endpoint<{ groupBy?: 'status' | 'space'; spaceId?: string } | void, Record<string, number>>({
    method: 'GET',
    path: (q) => withQuery('/tasks/counts', q || undefined),
  }),
  get: endpoint<Id, Task>({ method: 'GET', path: (a) => path`/tasks/${a.id}` }),
  create: endpoint<void, Task, Record<string, unknown>>({ method: 'POST', path: () => '/tasks' }),
  /** ⚠️ PUT — the gateway declares `@Put(':id')`; nothing answers PATCH /tasks/:id. */
  update: endpoint<Id, Task, Record<string, unknown>>({ method: 'PUT', path: (a) => path`/tasks/${a.id}` }),
  remove: endpoint<Id, void>({ method: 'DELETE', path: (a) => path`/tasks/${a.id}` }),
  assign: endpoint<Id, Task, { workerId: string }>({ method: 'PATCH', path: (a) => path`/tasks/${a.id}/assign` }),
  addAssignee: endpoint<Id, Task, { userId: string; role?: string }>({ method: 'POST', path: (a) => path`/tasks/${a.id}/assignees` }),
  removeAssignee: endpoint<Id & { userId: string }, Task>({ method: 'DELETE', path: (a) => path`/tasks/${a.id}/assignees/${a.userId}` }),
  setStatus: endpoint<Id, Task, TaskStatusBody>({ method: 'PATCH', path: (a) => path`/tasks/${a.id}/status` }),
  decline: endpoint<Id, void>({ method: 'POST', path: (a) => path`/tasks/${a.id}/decline` }),

  comments: endpoint<Id, Comment[]>({ method: 'GET', path: (a) => path`/tasks/${a.id}/comments` }),
  addComment: endpoint<Id, Comment, { content: string }>({ method: 'POST', path: (a) => path`/tasks/${a.id}/comments` }),
  /** The task's history — already-happened facts, kept for offline reading. */
  timeline: endpoint<Id, TaskEvent[]>({ method: 'GET', path: (a) => path`/tasks/${a.id}/timeline`, keep: true }),
  /** The step forms the job was moved through, with signed links (kept like the report). */
  submissions: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/tasks/${a.id}/submissions`, keep: true }),
  fullReport: endpoint<Id & { copy?: string; lang?: string }, TaskReport>({
    method: 'GET',
    path: ({ id, ...q }) => withQuery(path`/tasks/${id}/full-report`, q),
  }),
  customFields: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/tasks/${a.id}/custom-fields`, keep: true }),
  setCustomFields: endpoint<Id, unknown[], { values: unknown[] }>({ method: 'PATCH', path: (a) => path`/tasks/${a.id}/custom-fields` }),

  // ── time, crew, lead, hand-over ──
  time: endpoint<Id, JobTimeView>({ method: 'GET', path: (a) => path`/tasks/${a.id}/time`, keep: true }),
  jobTimeReport: endpoint<{ from: string; to: string; userId?: string }, unknown>({
    method: 'GET',
    path: (q) => withQuery('/tasks/job-time/report', q),
  }),
  crew: endpoint<Id & { action: CrewAction }, CrewView, Record<string, unknown>>({
    method: 'POST',
    path: (a) => path`/tasks/${a.id}/crew/${a.action}`,
  }),
  changeLead: endpoint<Id, CrewView, { toUserId: string; scope: 'TODAY' | 'PERMANENT'; reason?: string }>({
    method: 'PUT',
    path: (a) => path`/tasks/${a.id}/lead`,
  }),
  resume: endpoint<Id, Task>({ method: 'POST', path: (a) => path`/tasks/${a.id}/resume` }),
  writeHandover: endpoint<Id, TaskHandover, { id?: string; note: string; attachmentIds?: string[] }>({
    method: 'POST',
    path: (a) => path`/tasks/${a.id}/handover`,
  }),
  /** My jobs in work, notes I owe, jobs paused on me — one read. */
  myHandovers: endpoint<void, unknown>({ method: 'GET', path: () => '/tasks/handover/mine', keep: true }),

  // ── a task open to a WORK role (shared tasks/role-pool.ts) ──
  openForMe: endpoint<void, OpenRoleTask[]>({ method: 'GET', path: () => '/tasks/open-for-me' }),
  take: endpoint<Id, { id: string; spotsLeft: number; waitedMinutes: number | null }>({ method: 'POST', path: (a) => path`/tasks/${a.id}/take` }),
  returnToRole: endpoint<Id, void, { reason?: string }>({ method: 'POST', path: (a) => path`/tasks/${a.id}/return-to-role` }),
  setOpenRole: endpoint<Id, Task, { roleId: string | null; spots?: number }>({ method: 'PUT', path: (a) => path`/tasks/${a.id}/open-role` }),
  roleOptions: endpoint<{ spaceId: string }, unknown[]>({ method: 'GET', path: (q) => withQuery('/tasks/role-options', q) }),
  rolePreview: endpoint<{ spaceId: string; roleId: string; lat?: number; lng?: number }, unknown>({
    method: 'GET',
    path: (q) => withQuery('/tasks/role-preview', q),
  }),
  roleStats: endpoint<{ spaceId?: string; from?: string; to?: string }, unknown>({ method: 'GET', path: (q) => withQuery('/tasks/role-stats', q) }),

  // ── checklist, subtasks, dependencies ──
  addChecklistItem: endpoint<Id, ChecklistItem, { title: string; assigneeId?: string | null }>({
    method: 'POST',
    path: (a) => path`/tasks/${a.id}/checklist`,
  }),
  /** Tick / untick, rename, or give to somebody on the crew. ⚠️ Not queued offline. */
  updateChecklistItem: endpoint<Id & { itemId: string }, ChecklistItem, ChecklistItemPatch>({
    method: 'PATCH',
    path: (a) => path`/tasks/${a.id}/checklist/${a.itemId}`,
  }),
  removeChecklistItem: endpoint<Id & { itemId: string }, void>({ method: 'DELETE', path: (a) => path`/tasks/${a.id}/checklist/${a.itemId}` }),
  reorderChecklist: endpoint<Id, ChecklistItem[], { itemIds: string[] }>({ method: 'PATCH', path: (a) => path`/tasks/${a.id}/checklist/reorder` }),
  subtasks: endpoint<Id, Task[]>({ method: 'GET', path: (a) => path`/tasks/${a.id}/subtasks` }),
  addSubtask: endpoint<Id, Task, Record<string, unknown>>({ method: 'POST', path: (a) => path`/tasks/${a.id}/subtasks` }),
  addDependency: endpoint<Id, unknown, { dependsOnId: string; type?: string }>({ method: 'POST', path: (a) => path`/tasks/${a.id}/dependencies` }),
  removeDependency: endpoint<Id & { depId: string }, void>({ method: 'DELETE', path: (a) => path`/tasks/${a.id}/dependencies/${a.depId}` }),
  /**
   * ⚠️ `suggested-employees`. The web's tasksApi still asks
   * `/tasks/:id/suggested-technicians`, which the gateway does not serve.
   */
  suggestedEmployees: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/tasks/${a.id}/suggested-employees` }),

  // ── attachments (presign → PUT to storage → confirm) ──
  attachmentPresign: endpoint<Id, PresignedUpload, { fileName: string; fileType: string }>({
    method: 'POST',
    path: (a) => path`/tasks/${a.id}/attachments/presign`,
  }),
  attachmentConfirm: endpoint<Id, unknown, { fileName: string; fileKey?: string; fileUrl?: string; fileType: string; fileSize?: number }>({
    method: 'POST',
    path: (a) => path`/tasks/${a.id}/attachments`,
  }),
  attachments: endpoint<Id, unknown[]>({ method: 'GET', path: (a) => path`/tasks/${a.id}/attachments` }),
  removeAttachment: endpoint<Id & { attachmentId: string }, void>({
    method: 'DELETE',
    path: (a) => path`/tasks/${a.id}/attachments/${a.attachmentId}`,
  }),

  // ── the service report ──
  /** The report a finished job was closed with — `null` when there is none. Kept offline. */
  report: endpoint<Id, ServiceReport | null>({ method: 'GET', path: (a) => path`/tasks/${a.id}/report`, keep: true }),
  complete: endpoint<Id, ServiceReport, Record<string, unknown>>({ method: 'POST', path: (a) => path`/tasks/${a.id}/complete` }),

  // ── workspace maintenance ──
  resyncSpace: endpoint<{ spaceId: string }, unknown>({ method: 'POST', path: (a) => path`/tasks/resync/${a.spaceId}` }),
  resyncAll: endpoint<void, unknown>({ method: 'POST', path: () => '/tasks/resync-all' }),
});

/** A service report's own routes (`/reports/:id/...`) and an asset's maintenance history. */
export const reportsEndpoints = defineEndpoints('reports', {
  update: endpoint<Id, ServiceReport, Record<string, unknown>>({ method: 'PATCH', path: (a) => path`/reports/${a.id}` }),
  addPart: endpoint<Id, unknown, { name: string; partNumber?: string; quantity?: number; unitCost?: number; notes?: string }>({
    method: 'POST',
    path: (a) => path`/reports/${a.id}/parts`,
  }),
  updatePart: endpoint<Id & { partId: string }, unknown, Record<string, unknown>>({
    method: 'PATCH',
    path: (a) => path`/reports/${a.id}/parts/${a.partId}`,
  }),
  removePart: endpoint<Id & { partId: string }, void>({ method: 'DELETE', path: (a) => path`/reports/${a.id}/parts/${a.partId}` }),
  attachmentPresign: endpoint<Id, PresignedUpload, Record<string, unknown>>({ method: 'POST', path: (a) => path`/reports/${a.id}/attachments/presign` }),
  attachmentConfirm: endpoint<Id, unknown, Record<string, unknown>>({ method: 'POST', path: (a) => path`/reports/${a.id}/attachments` }),
  removeAttachment: endpoint<Id & { attachmentId: string }, void>({
    method: 'DELETE',
    path: (a) => path`/reports/${a.id}/attachments/${a.attachmentId}`,
  }),
  forAsset: endpoint<{ assetId: string; page?: number; limit?: number }, ServiceReport[]>({
    method: 'GET',
    path: ({ assetId, ...q }) => withQuery(path`/assets/${assetId}/reports`, q),
  }),
});
