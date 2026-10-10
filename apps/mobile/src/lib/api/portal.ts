import { call, E } from './client';
import type {
  CustomerUnit,
  CustomerRequestView,
  PortalConfig,
  PortalRequestDetail,
  SubmitRequestInput,
} from '@hbcfield/shared/client';

// Customer-portal API (external CUSTOMER persona). Mirrors the gateway /portal/*
// routes. The client already unwraps the `{ data }` envelope.
export const portalApi = {
  config: async (): Promise<PortalConfig> =>
    call(E.portal.config),

  units: async (): Promise<CustomerUnit[]> =>
    (await call(E.portal.units)) ?? [],

  requests: async (): Promise<CustomerRequestView[]> =>
    (await call(E.portal.requests)) ?? [],

  request: async (id: string): Promise<PortalRequestDetail> =>
    call(E.portal.request, { id }),

  submit: async (input: SubmitRequestInput): Promise<{ id: string }> =>
    call(E.portal.submit, undefined, { body: input }),
};
