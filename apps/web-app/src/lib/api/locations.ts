import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { AssignMemberInput, CreateLocationInput, LocationAssignment, UpdateAssignmentInput, UpdateLocationInput } from './types/locations';
import { locationsEndpoints, tasksEndpoints, type CompanyLocation } from '@hbcfield/shared/client';

export const locationsApi = {
  // NB: no `search` option — GET /locations exposes page/limit/includeInactive/kind
  // only. It used to be in this signature but was never forwarded, so callers
  // passing it got unfiltered results with no error.
  list: async (params?: { page?: number; limit?: number; includeInactive?: boolean; kind?: string }) => {

    const response = await call(locationsEndpoints.list, undefined, { query: {
      page: params?.page,
      limit: params?.limit,
      includeInactive: params?.includeInactive,
      // Default (omitted) hides CUSTOMER spaces from work pickers; pass 'all' for the directory.
      kind: params?.kind,
    } }) as ApiResponse<{
      success: boolean;
      data: CompanyLocation[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>;

    if (response.error) throw apiError(response);
    return response.data;
  },

  getById: async (id: string) => {
    const response = await call(locationsEndpoints.get, { id }) as ApiResponse<{ success: boolean; data: CompanyLocation }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  create: async (data: CreateLocationInput) => {
    const response = await call(locationsEndpoints.create, undefined, { body: data }) as ApiResponse<{ success: boolean; data: CompanyLocation }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  update: async (id: string, data: UpdateLocationInput) => {
    const response = await call(locationsEndpoints.update, { id }, { body: data }) as ApiResponse<{ success: boolean; data: CompanyLocation }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  delete: async (id: string) => {
    const response = await call(locationsEndpoints.archive, { id }) as ApiResponse<{ success: boolean; data: CompanyLocation }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /**
   * Make this the organization's default workspace.
   *
   * Its own call rather than a field on update: it clears the flag on a
   * different space, so it is a choice about the organization rather than a
   * property of this one.
   */
  makeDefault: async (id: string) => {
    const response = await call(locationsEndpoints.setDefault, { id }, { body: {} }) as ApiResponse<{ success: boolean; data: { id: string; isDefault: boolean } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** Permanent delete — server rejects spaces that still carry history. */
  purge: async (id: string) => {
    const response = await call(locationsEndpoints.removePermanently, { id }) as ApiResponse<{ success: boolean; data: { id: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // Member assignments
  getAssignedMembers: async (locationId: string) => {
    const response = await call(locationsEndpoints.members, { id: locationId }) as ApiResponse<{ success: boolean; data: LocationAssignment[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  // Batched: rosters (with current task) for many spaces in one request.
  getRosters: async (locationIds: string[]) => {
    if (locationIds.length === 0) return [] as LocationAssignment[];
    const response = await call(locationsEndpoints.rosters, { ids: locationIds }) as ApiResponse<{ success: boolean; data: LocationAssignment[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  assignMember: async (locationId: string, data: AssignMemberInput) => {
    const response = await call(locationsEndpoints.assignMember, { id: locationId }, { body: data }) as ApiResponse<{ success: boolean; data: LocationAssignment }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateAssignment: async (locationId: string, assignmentId: string, data: UpdateAssignmentInput) => {
    const response = await call(locationsEndpoints.updateMember, { id: locationId, assignmentId }, { body: data }) as ApiResponse<{ success: boolean; data: LocationAssignment }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeAssignment: async (locationId: string, assignmentId: string) => {
    const response = await call(locationsEndpoints.removeMember, { id: locationId, assignmentId }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  getEffectiveModules: async (spaceId: string) => {
    const response = await call(locationsEndpoints.modules, { id: spaceId }) as ApiResponse<{ success: boolean; data: { enabledModules: string[]; workflowId?: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // Re-sync existing tasks in a space onto the space's workflow (ADMIN only).
  resyncTasks: async (spaceId: string) => {
    const response = await call(tasksEndpoints.resyncSpace, { spaceId }, { body: {} }) as ApiResponse<{ success: boolean; data: { updated: number; remapped: number; reason?: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // Re-sync EVERY space's tasks onto their workflows in one action (ADMIN only).
  resyncAllTasks: async () => {
    const response = await call(tasksEndpoints.resyncAll, undefined, { body: {} }) as ApiResponse<{ success: boolean; data: { spacesProcessed: number; updated: number; remapped: number } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
};
