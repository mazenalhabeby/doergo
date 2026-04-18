import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';
import type { Task, Comment, TaskEvent, CreateTaskInput, UpdateTaskInput, LocationUpdate, LocationResponse } from './types';

export interface TasksListParams {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  includeNoDueDate?: boolean;
  page?: number;
  limit?: number;
}

// Tasks API
export const tasksApi = {
  list: async (params?: TasksListParams): Promise<Task[]> => {
    const url = buildUrlWithQuery('/tasks', params ?? {});
    return fetchWithAuth<Task[]>(url, { method: 'GET' });
  },

  getById: async (id: string): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}`, { method: 'GET' });
  },

  updateStatus: async (id: string, status: string, reason?: string): Promise<Task> => {
    return fetchWithAuth<Task>(`/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
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
};
