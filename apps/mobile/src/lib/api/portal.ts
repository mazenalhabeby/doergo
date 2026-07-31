import { fetchWithAuth } from './client';
import type {
  IntakeCategory,
  CustomerUnit,
  CustomerRequestView,
  PortalFeatureFlags,
  SubmitRequestInput,
} from '@hbcfield/shared/client';

// Customer-portal API (external CUSTOMER persona). Mirrors the gateway /portal/*
// routes. `fetchWithAuth` already unwraps the `{ data }` envelope.
export interface PortalConfig {
  id?: string;
  /** The portal's display name (e.g. "Rivergate Rentals"). */
  name: string | null;
  templateKey?: string;
  enabled: boolean;
  entityLabel: string;
  contactLabel: string;
  accent: string;
  features: PortalFeatureFlags;
  categories: IntakeCategory[];
}

export type PortalRequestDetail = CustomerRequestView & {
  description?: string | null;
  attachments?: { id: string; fileUrl: string; fileType: string; fileName: string }[];
};

export const portalApi = {
  config: async (): Promise<PortalConfig> =>
    fetchWithAuth<PortalConfig>('/portal/config', { method: 'GET' }),

  units: async (): Promise<CustomerUnit[]> =>
    (await fetchWithAuth<CustomerUnit[]>('/portal/units', { method: 'GET' })) ?? [],

  requests: async (): Promise<CustomerRequestView[]> =>
    (await fetchWithAuth<CustomerRequestView[]>('/portal/requests', { method: 'GET' })) ?? [],

  request: async (id: string): Promise<PortalRequestDetail> =>
    fetchWithAuth<PortalRequestDetail>(`/portal/requests/${id}`, { method: 'GET' }),

  submit: async (input: SubmitRequestInput): Promise<{ id: string }> =>
    fetchWithAuth<{ id: string }>('/portal/requests', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
