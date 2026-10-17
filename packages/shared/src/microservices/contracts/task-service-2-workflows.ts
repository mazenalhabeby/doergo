import { rpc } from '../contract';

/** task-service `workflows` handlers — the request each one reads. */

export const findAllWorkflows = rpc<{ organizationId: string }>('find_all_workflows');
export const findWorkflow = rpc<{ id: string; organizationId: string }>('find_workflow');
export const createWorkflow = rpc<{
  name: string;
  isDefault?: boolean;
  organizationId: string;
  ownerSpaceId?: null | string;
  capabilities?: string[];
  statuses?: {
    name: string;
    nameKey?: null | string;
    key: string;
    color?: string;
    icon?: string;
    position?: number;
    isFinal?: boolean;
    isCanceled?: boolean;
    transitions?: string[];
    capabilities?: string[];
    form?: unknown;
  }[];
}>('create_workflow');
export const updateWorkflow = rpc<{
  id: string;
  organizationId: string;
  name?: string;
  isActive?: boolean;
  capabilities?: string[];
}>('update_workflow');
export const deleteWorkflow = rpc<{ id: string; organizationId: string }>('delete_workflow');
export const setDefaultWorkflow = rpc<{ id: string; organizationId: string }>('set_default_workflow');
export const addWorkflowStatus = rpc<{
  workflowId: string;
  organizationId: string;
  name: string;
  key: string;
  color?: string;
  icon?: string;
  position?: number;
  isFinal?: boolean;
  isCanceled?: boolean;
  transitions?: string[];
  capabilities?: string[];
  form?: unknown;
}>('add_workflow_status');
export const updateWorkflowStatus = rpc<{
  workflowId: string;
  statusId: string;
  organizationId: string;
  name?: string;
  color?: string;
  icon?: string;
  position?: number;
  isFinal?: boolean;
  isCanceled?: boolean;
  transitions?: string[];
  capabilities?: string[];
  form?: unknown;
}>('update_workflow_status');
export const deleteWorkflowStatus = rpc<{ workflowId: string; statusId: string; organizationId: string }>(
  'delete_workflow_status',
);
export const reorderWorkflowStatuses = rpc<{ workflowId: string; organizationId: string; statusIds: string[] }>(
  'reorder_workflow_statuses',
);
export const getDefinitionOfDone = rpc<{ organizationId: string; workflowId?: string }>('get_definition_of_done');
export const upsertDefinitionOfDone = rpc<{
  id?: string;
  organizationId: string;
  workflowId?: string;
  items: { text: string; isRequired: boolean }[];
  isActive?: boolean;
}>('upsert_definition_of_done');
export const deleteDefinitionOfDone = rpc<{ id: string; organizationId: string }>('delete_definition_of_done');
export const listSpaceWorkflows = rpc<{ spaceId: string; organizationId: string }>('list_space_workflows');
export const attachSpaceWorkflow = rpc<{
  spaceId: string;
  workflowId: string;
  organizationId: string;
  makeDefault?: boolean;
}>('attach_space_workflow');
export const detachSpaceWorkflow = rpc<{ spaceId: string; workflowId: string; organizationId: string }>(
  'detach_space_workflow',
);
export const shareWorkflowWithOrg = rpc<{ workflowId: string; organizationId: string }>('share_workflow_with_org');
export const forkWorkflowForSpace = rpc<{ workflowId: string; spaceId: string; organizationId: string }>(
  'fork_workflow_for_space',
);
export const setSpaceDefaultWorkflow = rpc<{ spaceId: string; workflowId: string; organizationId: string }>(
  'set_space_default_workflow',
);
export const listWorkflowTemplates = rpc<{ organizationId: string }>('list_workflow_templates');
export const useWorkflowTemplate = rpc<{
  templateId: string;
  organizationId: string;
  name?: string;
  isDefault?: boolean;
  spaceId?: string;
  shareWithOrganization?: boolean;
}>('use_workflow_template');
export const submitWorkflowToLibrary = rpc<{ workflowId: string; organizationId: string; note?: string }>(
  'submit_workflow_to_library',
);
export const curateListWorkflowTemplates = rpc<unknown>('curate_list_workflow_templates');
export const curateUpsertWorkflowTemplate = rpc<{
  id?: string;
  slug?: string;
  name?: string;
  description?: null | string;
  industry?: null | string;
  icon?: null | string;
  position?: number;
  isPublished?: boolean;
  statuses?: unknown;
}>('curate_upsert_workflow_template');
export const curatePublishWorkflowTemplate = rpc<{ id: string; isPublished: boolean }>(
  'curate_publish_workflow_template',
);
export const curateDeleteWorkflowTemplate = rpc<{ id: string }>('curate_delete_workflow_template');
export const curateImportWorkflowTemplate = rpc<{ workflowId: string; slug?: string; industry?: null | string }>(
  'curate_import_workflow_template',
);
