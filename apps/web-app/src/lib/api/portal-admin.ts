import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Customer } from './types/customers';
import type { PortalAssignableCustomer, PortalAvailableUnit, PortalCategoryInput, PortalDetail, PortalRequestView } from './types/portal-admin';
import { portalAdminWebEndpoints, type CustomerUnit as PortalCustomerUnit, type IntakeCategory as PortalIntakeCategory } from '@hbcfield/shared/client';

export const portalAdminApi = {
  // ── Portals ──
  getPortal: async (id: string) => {
    const res = await call(portalAdminWebEndpoints.getPortal, { id }) as ApiResponse<PortalDetail>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  updatePortal: async (id: string, input: { name?: string; templateKey?: string; reseed?: boolean; spaceId?: string | null }) => {
    const res = await call(portalAdminWebEndpoints.updatePortal, { id }, { body: input }) as ApiResponse<PortalDetail>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  deletePortal: async (id: string) => {
    const res = await call(portalAdminWebEndpoints.deletePortal, { id }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },

  // ── Intake categories (per portal) ──
  createCategory: async (input: PortalCategoryInput) => {
    const res = await call(portalAdminWebEndpoints.createCategory, undefined, { body: input }) as ApiResponse<PortalIntakeCategory>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  updateCategory: async (id: string, input: Partial<PortalCategoryInput> & { isActive?: boolean }) => {
    const res = await call(portalAdminWebEndpoints.updateCategory, { id }, { body: input }) as ApiResponse<PortalIntakeCategory>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  deleteCategory: async (id: string) => {
    const res = await call(portalAdminWebEndpoints.deleteCategory, { id }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },

  // ── Residents (per portal) ──
  residents: async (portalId: string, search?: string) => {
    const res = await call(portalAdminWebEndpoints.residents, undefined, { query: { portalId, search } }) as ApiResponse<{ data: Customer[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  /** Vacant apartments in the portal's space — for the invite picker. */
  availableUnits: async (portalId: string): Promise<PortalAvailableUnit[]> => {
    const res = await call(portalAdminWebEndpoints.availableUnits, { portalId }) as ApiResponse<{ data: PortalAvailableUnit[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  /** Existing CRM customers (non-residents) in the portal's space — for the invite picker. */
  availableCustomers: async (portalId: string): Promise<PortalAssignableCustomer[]> => {
    const res = await call(portalAdminWebEndpoints.availableCustomers, { portalId }) as ApiResponse<{ data: PortalAssignableCustomer[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },
  // Pass customerId to promote an existing CRM customer, or name/email to create one.
  // Pass unitId to assign an existing vacant apartment, or unitName/unitAddress to create one.
  inviteResident: async (portalId: string, input: { customerId?: string; name?: string; email?: string; unitId?: string; unitName?: string; unitAddress?: string }) => {
    const res = await call(portalAdminWebEndpoints.inviteResident, undefined, { body: { portalId, ...input } }) as ApiResponse<{ customer: Customer; unit: PortalCustomerUnit; code?: string }>;
    if (res.error) throw apiError(res);
    return res.data!;
  },

  // Remove a client from the portal — revokes app access + detaches (record kept).
  removeResident: async (customerId: string) => {
    const res = await call(portalAdminWebEndpoints.removeResident, { customerId }) as ApiResponse<{ data?: { success: boolean; deactivatedUserIds: string[] } }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  // Every request across a whole portal (office view; carries the client name).
  portalRequests: async (portalId: string) => {
    const res = await call(portalAdminWebEndpoints.portalRequests, { portalId }) as ApiResponse<{ data: PortalRequestView[] }>;
    if (res.error) throw apiError(res);
    return res.data?.data ?? [];
  },

  /** Route a pending request → live task (space + flow + priority + worker). */
  triageRequest: async (
    requestId: string,
    body: { spaceId: string; workflowId?: string | null; priority?: string; assignedToId?: string | null },
  ) => {
    const res = await call(portalAdminWebEndpoints.triageRequest, { requestId }, { body: body }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
    return res.data;
  },

  /** Upload a portal cover/hero image (client-home background). */
  uploadCover: async (portalId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await call(portalAdminWebEndpoints.uploadCover, { portalId }, { body: formData }) as ApiResponse<{ data: { coverImageUrl: string } }>;
    if (response.error) throw apiError({ ...response, error: response.error || "Upload failed" });
    return response.data?.data as { coverImageUrl: string };
  },

  removeCover: async (portalId: string) => {
    const res = await call(portalAdminWebEndpoints.removeCover, { portalId }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
    return res.data;
  },
};
