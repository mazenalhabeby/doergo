import { fetchWithAuth } from './client';

export type MobileCustomFieldType =
  | 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'CHECKBOX' | 'URL' | 'EMAIL';

export interface MobileCustomFieldDefinition {
  id: string;
  organizationId: string;
  workflowId: string | null;
  name: string;
  key: string;
  type: MobileCustomFieldType;
  options: string[] | null;
  isRequired: boolean;
  position: number;
  isActive: boolean;
}

export interface MobileCustomFieldValue {
  id: string;
  definitionId: string;
  taskId: string;
  value: string;
  definition?: MobileCustomFieldDefinition;
}

/**
 * Custom fields for a task — the gateway resolves the applicable set from the
 * task's Task Type + global fields, so the mobile client just renders whatever
 * comes back.
 */
export const customFieldsApi = {
  getTaskValues: (taskId: string): Promise<MobileCustomFieldValue[]> =>
    fetchWithAuth<MobileCustomFieldValue[]>(`/tasks/${taskId}/custom-fields`, { method: 'GET' }),

  setTaskValues: (
    taskId: string,
    values: { definitionId: string; value: string }[],
  ): Promise<MobileCustomFieldValue[]> =>
    fetchWithAuth<MobileCustomFieldValue[]>(`/tasks/${taskId}/custom-fields`, {
      method: 'PATCH',
      body: JSON.stringify({ values }),
    }),
};
