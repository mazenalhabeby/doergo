/** task-service: jobs — read, create, update, assign, steps, comments, attachments, search. */
import { rpc } from '../contract';
import type { AuthServiceReply } from './auth-service-replies';
import type { RoleTaskFacts, TaskAccessFacts, TaskSearchInput } from './task-service-types';
import type { SpaceScopeIds } from '../../access/space-scope';

/** The task list's filters, as `TaskQueryService.findAll` reads them (query-string values arrive as sent). */
export interface FindAllTasksMessage {
  page?: number | string;
  limit?: number | string;
  status?: unknown;
  priority?: unknown;
  search?: string;
  startDate?: string;
  endDate?: string;
  includeNoDueDate?: unknown;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
  spaceId?: string;
  sharedSpaceIds?: string[];
  viewAllSpaceIds?: string[];
  assignedToMe?: unknown;
  [filter: string]: unknown;
}

export const roleTasksOpenForMe = rpc<RoleTaskFacts>('role_tasks_open_for_me');

export const roleTaskTake = rpc<RoleTaskFacts & { taskId: string }>('role_task_take');

export const roleTaskReturn = rpc<RoleTaskFacts & { taskId: string; reason?: string | null }>('role_task_return');

export const roleTaskSetOpen = rpc<
  RoleTaskFacts & {
    taskId: string;
    roleId: string | null;
    spots?: number;
    userRole: string;
    canAssignTasks?: boolean;
    canViewAllTasks?: boolean;
    assignSpaceIds?: string[];
  }
>('role_task_set_open');

export const roleTaskOptions = rpc<{ organizationId: string; spaceId: string }>('role_task_options');

export const roleTaskPreview = rpc<
  RoleTaskFacts & { spaceId: string; roleId: string; lat?: number | null; lng?: number | null }
>('role_task_preview');

export const roleTaskStats = rpc<{ organizationId: string; spaceIds?: string[]; from?: string; to?: string }>(
  'role_task_stats',
);

export const taskHealth = rpc<void>('task_health');

export const findAllTasks = rpc<FindAllTasksMessage>('find_all_tasks');

export const findTaskSpace = rpc<{ id: string; organizationId: string }, AuthServiceReply<{ spaceId?: string | null }>>(
  'find_task_space',
);

export const findTask = rpc<{
  id: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
  sharedSpaceIds?: string[];
  viewAllSpaceIds?: string[];
}>('find_task');

export const taskFullReport = rpc<
  TaskAccessFacts & { id: string; copy?: unknown; include?: unknown; issuer?: unknown }
>('task_full_report');

export const getTaskSubmissions = rpc<TaskAccessFacts & { id: string }>('get_task_submissions');

export const getTaskTimeline = rpc<{
  id: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
}>('get_task_timeline');

export const getTaskTime = rpc<TaskAccessFacts & { id: string }>('get_task_time');

export const getJobTimeReport = rpc<{ userId: string; organizationId: string; from: string; to: string }>(
  'get_job_time_report',
);

export const getMyHandovers = rpc<{ userId: string; organizationId: string }>('get_my_handovers');

export const getComments = rpc<{
  taskId: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
}>('get_comments');

export const getStatusCounts = rpc<{
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
  spaceId?: string;
  viewAllSpaceIds?: string[];
  groupBy?: string;
}>('get_status_counts');

export const getSuggestedTechnicians = rpc<{
  taskId: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  canAssignTasks?: boolean;
  assignSpaceIds?: string[];
  organizationId: string;
}>('get_suggested_technicians');

export const getTaskAssignees = rpc<{
  taskId: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
}>('get_task_assignees');

export const getTaskChecklist = rpc<{
  taskId: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
}>('get_task_checklist');

export const resyncSpaceWorkflow = rpc<{ spaceId: string; organizationId: string }>('resync_space_workflow');

export const resyncAllSpaces = rpc<{ organizationId: string }>('resync_all_spaces');

export const portalListRequests = rpc<{ organizationId: string; customerId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'portal_list_requests',
);

export const portalListRequestsByPortal = rpc<{
  organizationId: string;
  portalId: string;
  scopeSpaceIds?: SpaceScopeIds;
}>('portal_list_requests_by_portal');

/** Every request waiting for triage across the caller's portals (the approvals inbox). */
export const portalListWaitingRequests = rpc<{ organizationId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'portal_list_waiting_requests',
);

export const portalGetRequest = rpc<{ id: string; organizationId: string; customerId: string }>('portal_get_request');

export const portalTriageRequest = rpc<{
  id: string;
  organizationId: string;
  spaceId: string;
  workflowId?: string | null;
  priority?: string;
  assignedToId?: string | null;
  userId: string;
  scopeSpaceIds?: SpaceScopeIds;
  assignScopeSpaceIds?: SpaceScopeIds;
}>('portal_triage_request');

export const getSubtasks = rpc<{
  taskId: string;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
}>('get_subtasks');

export const getAttachments = rpc<{ taskId: string; userId: string; userRole: string; organizationId: string }>(
  'get_attachments',
);

export const searchTasksAndSpaces = rpc<TaskSearchInput>('search_tasks_and_spaces');
