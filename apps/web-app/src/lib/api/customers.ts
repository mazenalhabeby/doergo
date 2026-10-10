import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Customer, CustomerActivity, CustomerAddress, CustomerCompanyLink, CustomerContactLink, CustomerInput } from './types/customers';
import { customersEndpoints } from '@hbcfield/shared/client';

export const customersApi = {
  list: async (params?: { search?: string; status?: "active" | "inactive" | "all"; portalResident?: boolean; spaceId?: string; includeUnfiled?: boolean; page?: number; limit?: number; contacts?: "exclude" | "only" | "all"; type?: "PERSON" | "COMPANY" }) => {
    const res = await call(customersEndpoints.list, undefined, { query: params || {} }) as ApiResponse<{ data: Customer[]; meta: { total: number; page: number; limit: number; totalPages: number; crmCaps?: { view: "none" | "own" | "all"; work: boolean; editInfo: boolean; manage: boolean; canAccess: boolean } } }>;
    if (res.error) throw apiError(res);
    return res.data!;
  },
  /** Invite a space customer to the B2C app — returns the invite code. Pass
   *  portalId to bind them to a specific portal (= entity + categories) when the
   *  space runs several. Omit to auto-resolve (their unit's portal / the default). */
  invite: async (id: string, opts?: { email?: string; portalId?: string }) => {
    const res = await call(customersEndpoints.invite, { id }, { body: { email: opts?.email, portalId: opts?.portalId } }) as ApiResponse<{ data: { code?: string; email?: string } }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  // ── CRM activity timeline ──
  activities: async (id: string) => {
    const res = await call(customersEndpoints.activities, { id }) as ApiResponse<{ data: CustomerActivity[] }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  addActivity: async (id: string, input: { type?: string; body?: string; dueAt?: string; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }) => {
    const res = await call(customersEndpoints.addActivity, { id }, { body: input }) as ApiResponse<{ data: CustomerActivity }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  updateActivity: async (id: string, activityId: string, input: { body?: string; dueAt?: string | null; done?: boolean; reminderKind?: string; remindBeforeMin?: number; reminderAssigneeId?: string | null; repeat?: string }) => {
    const res = await call(customersEndpoints.updateActivity, { id, activityId }, { body: input }) as ApiResponse<{ data: CustomerActivity }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  removeActivity: async (id: string, activityId: string) => {
    const res = await call(customersEndpoints.removeActivity, { id, activityId }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  // ── Addresses (a customer's units; one primary → on the map) ──
  // ── Contact people ────────────────────────────────────────────────────────
  contacts: async (companyId: string): Promise<CustomerContactLink[]> => {
    const res = await call(customersEndpoints.contacts, { id: companyId }) as ApiResponse<{ data?: CustomerContactLink[] }>;
    if (res.error) throw apiError(res);
    return (res.data as { data?: CustomerContactLink[] })?.data ?? [];
  },
  contactCompanies: async (personId: string): Promise<CustomerCompanyLink[]> => {
    const res = await call(customersEndpoints.companies, { id: personId }) as ApiResponse<{ data?: CustomerCompanyLink[] }>;
    if (res.error) throw apiError(res);
    return (res.data as { data?: CustomerCompanyLink[] })?.data ?? [];
  },
  addContact: async (
    companyId: string,
    input: { personId?: string; person?: { name: string; email?: string; phone?: string }; role?: string; isPrimary?: boolean },
  ) => {
    const res = await call(customersEndpoints.addContact, { id: companyId }, { body: input }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  updateContact: async (linkId: string, input: { role?: string | null; isPrimary?: boolean }) => {
    const res = await call(customersEndpoints.updateContact, { linkId }, { body: input }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  removeContact: async (linkId: string) => {
    const res = await call(customersEndpoints.removeContact, { linkId }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  /** Make a contact a client in their own right — they start counting from then on. */
  promoteContact: async (personId: string) => {
    const res = await call(customersEndpoints.promote, { id: personId }, { body: {} }) as ApiResponse<unknown>;
    if (res.error) throw apiError(res);
    return res.data;
  },

  addresses: async (id: string): Promise<CustomerAddress[]> => {
    const res = await call(customersEndpoints.addresses, { id }) as ApiResponse<CustomerAddress[]>;
    if (res.error) throw apiError(res);
    return res.data ?? [];
  },
  addAddress: async (id: string, input: { name?: string; address?: string; lat?: number; lng?: number; isPrimary?: boolean; contactName?: string | null; contactPhone?: string | null }) => {
    const res = await call(customersEndpoints.addAddress, { id }, { body: input }) as ApiResponse<CustomerAddress>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  updateAddress: async (id: string, unitId: string, input: { name?: string; address?: string; lat?: number; lng?: number; contactName?: string | null; contactPhone?: string | null }) => {
    const res = await call(customersEndpoints.updateAddress, { id, unitId }, { body: input }) as ApiResponse<CustomerAddress>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  setPrimaryAddress: async (id: string, unitId: string) => {
    const res = await call(customersEndpoints.setPrimaryAddress, { id, unitId }, { body: {} }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  removeAddress: async (id: string, unitId: string) => {
    const res = await call(customersEndpoints.removeAddress, { id, unitId }) as ApiResponse<{ success: boolean }>;
    if (res.error) throw apiError(res);
    return res.data;
  },
  get: async (id: string) => {
    const res = await call(customersEndpoints.get, { id }) as ApiResponse<{ data: Customer }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  create: async (dto: CustomerInput) => {
    const res = await call(customersEndpoints.create, undefined, { body: dto }) as ApiResponse<{ data: Customer }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
  update: async (id: string, dto: CustomerInput) => {
    const res = await call(customersEndpoints.update, { id }, { body: dto }) as ApiResponse<{ data: Customer }>;
    if (res.error) throw apiError(res);
    return res.data!.data;
  },
};
