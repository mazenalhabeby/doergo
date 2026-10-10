import type { CustomerRequestView, IntakeCategory as PortalIntakeCategory, PortalFeatureFlags } from '@hbcfield/shared/client';

export interface PortalDetail {
  id: string;
  name: string;
  enabled: boolean;
  templateKey: string;
  entityLabel: string;
  contactLabel: string;
  accent: string;
  coverImageUrl?: string | null;
  spaceId?: string | null;
  features: PortalFeatureFlags;
  categories: PortalIntakeCategory[];
}


/** A vacant apartment offered in the invite dialog (portal's space catalog). */
export interface PortalAvailableUnit {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}


/** An existing CRM customer offered in the invite dialog (portal's space). */
export interface PortalAssignableCustomer {
  id: string;
  name: string;
  email?: string | null;
}


export interface PortalCategoryInput {
  portalId?: string;
  key?: string;
  label: string;
  icon?: string;
  color?: string;
  urgent?: boolean;
  team?: string;
  defaultPriority?: string | null;
  issues?: string[];
  position?: number;
}


export interface PortalRequestView extends CustomerRequestView {
  customerId: string | null;
  customerName: string | null;
  updatedAt?: string;
}
