import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { StatusWorkflow, StepFormInput, WorkflowLibraryTemplate, WorkflowStatus } from './types/workflows';
import { workflowsWebEndpoints } from '@hbcfield/shared/client';

export const workflowsApi = {
  // ── The shared task-type library ────────────────────────────────────────────
  //
  // Read and copy only. The statuses are never sent from here — using a template
  // sends its id, and the server reads the definition itself, so what a new task
  // type looks like is not something the browser decides.

  library: {
    list: async (): Promise<WorkflowLibraryTemplate[]> => {
      const response = await call(workflowsWebEndpoints.libraryList) as ApiResponse<{ success: boolean; data: WorkflowLibraryTemplate[] }>;
      if (response.error) throw apiError(response);
      return response.data?.data || [];
    },

    /**
     * Copy a template in. With `spaceId` it FORKS into that space — the copy is
     * that space's own, so editing it there affects nobody else. Pass
     * `shareWithOrganization` to take it org-wide instead, so several spaces can
     * offer one definition.
     */
    use: async (
      templateId: string,
      opts?: { name?: string; isDefault?: boolean; spaceId?: string; shareWithOrganization?: boolean },
    ): Promise<StatusWorkflow | undefined> => {
      const response = await call(
        workflowsWebEndpoints.libraryUse,
        { templateId },
        { body: opts ?? {} }) as ApiResponse<{ success: boolean; data: StatusWorkflow }>;
      if (response.error) throw apiError(response);
      return response.data?.data;
    },
  },

  // ── Which task types a space offers ─────────────────────────────────────────

  /** This space's task types, default first. */
  listForSpace: async (spaceId: string) => {
    const response = await call(
      workflowsWebEndpoints.listForSpace,
      { spaceId }) as ApiResponse<{ success: boolean; data: (StatusWorkflow & { isDefault?: boolean })[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  /** Offer a task type here. Refused when the space lacks a module its steps need. */
  attachToSpace: async (spaceId: string, workflowId: string, makeDefault?: boolean) => {
    const response = await call(
      workflowsWebEndpoints.attachToSpace,
      { spaceId, workflowId },
      { body: { makeDefault } }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  detachFromSpace: async (spaceId: string, workflowId: string) => {
    const response = await call(workflowsWebEndpoints.detachFromSpace, { spaceId, workflowId }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  /** Take this space's own copy of a shared task type, so it can diverge. */
  forkForSpace: async (spaceId: string, workflowId: string) => {
    const response = await call(
      workflowsWebEndpoints.forkForSpace,
      { spaceId, workflowId },
      { body: {} }) as ApiResponse<{ success: boolean; data: { workflowId: string; name: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** Widen a space's own task type so any space in the organization can offer it. */
  shareWithOrganization: async (workflowId: string) => {
    const response = await call(workflowsWebEndpoints.shareWithOrganization, { workflowId }, { body: {} }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  setSpaceDefault: async (spaceId: string, workflowId: string) => {
    const response = await call(workflowsWebEndpoints.setSpaceDefault, { spaceId, workflowId }, { body: {} }) as ApiResponse<unknown>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  list: async () => {
    const response = await call(workflowsWebEndpoints.list) as ApiResponse<{ success: boolean; data: StatusWorkflow[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  getById: async (id: string) => {
    const response = await call(workflowsWebEndpoints.getById, { id }) as ApiResponse<{ success: boolean; data: StatusWorkflow }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  create: async (data: {
    name: string;
    isDefault?: boolean;
    /** Create it as this space's own. Omit for one the organization can share. */
    spaceId?: string;
    /** What the TASK carries throughout: sprint, story_points, subtasks… */
    capabilities?: string[];
    statuses?: Array<{
      name: string;
      key: string;
      color?: string;
      icon?: string;
      position?: number;
      isFinal?: boolean;
      isCanceled?: boolean;
      transitions?: string[];
      capabilities?: string[];
    }>;
  }) => {
    const response = await call(
      workflowsWebEndpoints.create,
      undefined,
      { body: data }) as ApiResponse<{ success: boolean; data: StatusWorkflow }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /**
   * Offer this task type to the shared library. It does NOT publish — a curator
   * reads it before any other organization is offered it.
   */
  submitToLibrary: async (id: string, note?: string) => {
    const response = await call(
      workflowsWebEndpoints.submitToLibrary,
      { id },
      { body: { note } }) as ApiResponse<{ success: boolean; data: { id: string; resubmitted: boolean } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  update: async (id: string, data: Partial<StatusWorkflow>) => {
    const response = await call(
      workflowsWebEndpoints.update,
      { id },
      { body: data }) as ApiResponse<{ success: boolean; data: StatusWorkflow }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  addStatus: async (
    workflowId: string,
    data: {
      name: string;
      key: string;
      color: string;
      position?: number;
      isFinal?: boolean;
      isCanceled?: boolean;
      transitions?: string[];
      capabilities?: string[];
      wipLimit?: number | null;
      /** The step form; omit to leave it, null to clear it. */
      form?: StepFormInput;
    },
  ) => {
    const response = await call(
      workflowsWebEndpoints.addStatus,
      { workflowId },
      { body: data }) as ApiResponse<{ success: boolean; data: WorkflowStatus }>;
    // Coded: a bad step form is refused as STEP_FORM_DEFINITION_INVALID with
    // the fields it objects to, which the builder shows on the field.
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateStatus: async (
    workflowId: string,
    statusId: string,
    data: Omit<Partial<WorkflowStatus>, 'form'> & { form?: StepFormInput },
  ) => {
    const response = await call(
      workflowsWebEndpoints.updateStatus,
      { workflowId, statusId },
      { body: data }) as ApiResponse<{ success: boolean; data: WorkflowStatus }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  deleteStatus: async (workflowId: string, statusId: string) => {
    const response = await call(
      workflowsWebEndpoints.deleteStatus,
      { workflowId, statusId }) as ApiResponse<{ success: boolean; message: string }>;
    if (response.error) throw apiError(response);
    return response.data;
  },
};
