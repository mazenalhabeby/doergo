import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  ChecklistItem,
  Comment,
  CreateTaskInput,
  Task,
  TaskAssignee,
  TaskDependency,
  TaskEvent,
  TaskResponse,
} from './types/tasks';
import { tasksEndpoints } from '@hbcfield/shared/client';

/** A task's parts: timeline, comments, assignees, checklist, subtasks, dependencies. Part of `tasksApi`, moved here unchanged. */
export const taskPartsApi = {
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
    const response = await call(
      tasksEndpoints.addComment,
      { id: taskId },
      { body: { content } }) as ApiResponse<{ success: boolean; data: Comment }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // ── Assignees ──────────────────────────────────────────────────────────────
  addAssignee: async (taskId: string, userId: string, role?: string) => {
    const response = await call(
      tasksEndpoints.addAssignee,
      { id: taskId },
      { body: { userId, role: role || 'MEMBER' } }) as ApiResponse<{ success: boolean; data: TaskAssignee }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeAssignee: async (taskId: string, userId: string) => {
    const response = await call(
      tasksEndpoints.removeAssignee,
      { id: taskId, userId }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // ── Checklist ─────────────────────────────────────────────────────────────
  addChecklistItem: async (taskId: string, text: string) => {
    const response = await call(
      tasksEndpoints.addChecklistItem,
      { id: taskId },
      { body: { text } }) as ApiResponse<{ success: boolean; data: ChecklistItem }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateChecklistItem: async (
    taskId: string,
    itemId: string,
    data: { text?: string; isCompleted?: boolean; assigneeId?: string | null },
  ) => {
    const response = await call(
      tasksEndpoints.updateChecklistItem,
      { id: taskId, itemId },
      { body: data }) as ApiResponse<{ success: boolean; data: ChecklistItem }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  deleteChecklistItem: async (taskId: string, itemId: string) => {
    const response = await call(
      tasksEndpoints.removeChecklistItem,
      { id: taskId, itemId }) as ApiResponse<{ success: boolean; message: string }>;
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
    const response = await call(
      tasksEndpoints.addDependency,
      { id: taskId },
      { body: { predecessorId, type, lagDays } }) as ApiResponse<{ success: boolean; data: TaskDependency }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeDependency: async (taskId: string, depId: string) => {
    const response = await call(
      tasksEndpoints.removeDependency,
      { id: taskId, depId }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
};
