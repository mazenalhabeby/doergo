import { fetchWithAuth } from './client';
import { buildUrlWithQuery } from '@hbcfield/shared/client';

export interface MobileCustomer {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
  isPortalResident?: boolean;
  spaceId?: string | null;
  createdAt?: string;
}

export interface MobileCustomerActivity {
  id: string;
  type: 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'REMINDER' | 'STATUS' | 'SYSTEM';
  body?: string | null;
  dueAt?: string | null;
  doneAt?: string | null;
  metadata?: { from?: string; to?: string } | null;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string | null } | null;
}

export const customersApi = {
  /**
   * The client book, optionally narrowed to one workspace.
   *
   * `includeUnfiled` matters whenever a workspace is named: a client filed in
   * NO workspace is invisible to a strict space filter, and in a real book most
   * of them are. The server does that as one indexed OR — filtering here would
   * page-truncate before it filtered.
   */
  list: (params?: { spaceId?: string; includeUnfiled?: boolean; search?: string; limit?: number }): Promise<MobileCustomer[]> =>
    fetchWithAuth<MobileCustomer[]>(buildUrlWithQuery('/customers', { ...params, limit: params?.limit ?? 100 })),
  get: (id: string): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>(`/customers/${id}`),
  update: (id: string, dto: Partial<MobileCustomer>): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  activities: (id: string): Promise<MobileCustomerActivity[]> =>
    fetchWithAuth<MobileCustomerActivity[]>(`/customers/${id}/activities`),
  addActivity: (id: string, input: { type?: string; body?: string; dueAt?: string }): Promise<MobileCustomerActivity> =>
    fetchWithAuth<MobileCustomerActivity>(`/customers/${id}/activities`, { method: 'POST', body: JSON.stringify(input) }),
  updateActivity: (id: string, activityId: string, input: { done?: boolean }): Promise<MobileCustomerActivity> =>
    fetchWithAuth<MobileCustomerActivity>(`/customers/${id}/activities/${activityId}`, { method: 'PATCH', body: JSON.stringify(input) }),
};
