import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';
import type { Task, Comment, TaskEvent, CreateTaskInput, UpdateTaskInput, LocationUpdate, LocationResponse, LocationBatchUpdate } from './types';

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
  updateStatus: async (id: string, status: string, reason?: string, location?: { lat: number; lng: number; accuracy?: number }): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason, ...location }),
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

  update: async (id: string, input: UpdateTaskInput): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}`, {
      method: 'PATCH',
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

  getTimeline: async (taskId: string): Promise<TaskEvent[]> => {
    return fetchWithAuth<TaskEvent[]>(`/tasks/${taskId}/timeline`, { method: 'GET' });
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
