import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { CustomFieldDefinition, CustomFieldValue } from './types/custom-fields';
import { customFieldsWebEndpoints, tasksEndpoints } from '@hbcfield/shared/client';

export const customFieldsApi = {
  // No param → ALL definitions (editor). forWorkflow=<id> → that Task Type's
  // fields + globals. forWorkflow='__none__' → globals only.
  listDefinitions: async (params?: { forWorkflow?: string }) => {
    const response = await call(
      customFieldsWebEndpoints.listDefinitions,
      undefined,
      { query: { forWorkflow: params?.forWorkflow || undefined } }) as ApiResponse<{ success: boolean; data: CustomFieldDefinition[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  createDefinition: async (data: {
    name: string;
    key: string;
    type: string;
    options?: string[];
    isRequired?: boolean;
    workflowId?: string | null;
  }) => {
    const response = await call(
      customFieldsWebEndpoints.createDefinition,
      undefined,
      { body: data }) as ApiResponse<{ success: boolean; data: CustomFieldDefinition }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateDefinition: async (id: string, data: Partial<CustomFieldDefinition>) => {
    const response = await call(
      customFieldsWebEndpoints.updateDefinition,
      { id },
      { body: data }) as ApiResponse<{ success: boolean; data: CustomFieldDefinition }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  deleteDefinition: async (id: string) => {
    const response = await call(customFieldsWebEndpoints.deleteDefinition, { id }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  getTaskValues: async (taskId: string) => {
    const response = await call(tasksEndpoints.customFields, { id: taskId }) as ApiResponse<{ success: boolean; data: CustomFieldValue[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  setTaskValues: async (taskId: string, values: { definitionId: string; value: string }[]) => {
    const response = await call(
      tasksEndpoints.setCustomFields,
      { id: taskId },
      { body: { values } }) as ApiResponse<{ success: boolean; data: CustomFieldValue[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },
};
