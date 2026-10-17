import { rpc } from '../contract';

/** task-service `custom-fields` handlers — the request each one reads. */

export const findAllCustomFields = rpc<{ organizationId: string; forWorkflow?: string }>('find_all_custom_fields');
export const createCustomField = rpc<{
  name: string;
  key: string;
  type: string;
  options?: any;
  isRequired?: boolean;
  position?: number;
  workflowId?: null | string;
  organizationId: string;
}>('create_custom_field');
export const updateCustomField = rpc<{
  id: string;
  organizationId: string;
  name?: string;
  options?: any;
  isRequired?: boolean;
  position?: number;
  isActive?: boolean;
}>('update_custom_field');
export const deleteCustomField = rpc<{ id: string; organizationId: string }>('delete_custom_field');
export const getTaskCustomFields = rpc<
  {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  } & { taskId: string }
>('get_task_custom_fields');
export const setTaskCustomFields = rpc<
  {
    userId: string;
    userRole: string;
    organizationId: string;
    canViewAllTasks?: boolean;
    sharedSpaceIds?: string[];
    viewAllSpaceIds?: string[];
  } & { taskId: string; values: { definitionId: string; value: string }[] }
>('set_task_custom_fields');
