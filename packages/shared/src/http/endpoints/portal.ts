/**
 * The client portal, as a CLIENT (the CUSTOMER persona) sees it. Gateway:
 * modules/portal/portal.controller.ts. The office's portal administration
 * (`/portal/admin/*`, `/spaces/:id/portal*`) is web-only — added by the web.
 */
import type {
  CustomerRequestView,
  CustomerUnit,
  IntakeCategory,
  PortalFeatureFlags,
  SubmitRequestInput,
} from '../../customer-portal/types';
import { defineEndpoints, endpoint } from '../core/define';
import { path } from '../core/path';

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
  /** Optional cover photo for the client's home; null = the gradient. */
  coverImageUrl?: string | null;
}

export type PortalRequestDetail = CustomerRequestView & {
  description?: string | null;
  attachments?: { id: string; fileUrl: string; fileType: string; fileName: string }[];
};

export const portalEndpoints = defineEndpoints('portal', {
  config: endpoint<void, PortalConfig>({ method: 'GET', path: () => '/portal/config', keep: true }),
  units: endpoint<void, CustomerUnit[]>({ method: 'GET', path: () => '/portal/units', keep: true }),
  requests: endpoint<void, CustomerRequestView[]>({ method: 'GET', path: () => '/portal/requests', keep: true }),
  request: endpoint<{ id: string }, PortalRequestDetail>({
    method: 'GET',
    path: (a) => path`/portal/requests/${a.id}`,
    keep: true,
  }),
  submit: endpoint<void, { id: string }, SubmitRequestInput>({ method: 'POST', path: () => '/portal/requests' }),
});
