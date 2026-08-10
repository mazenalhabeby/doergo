/**
 * @hbcfield/shared — customer-portal types.
 *
 * Client-safe (pure TS, no server deps). Shared verbatim by the NestJS backend,
 * the office web app, and the React Native portal so request/intake shapes never
 * drift between producer and consumer.
 */

// Where a task originated (mirrors Task.source on the schema — free-form string).
export const TASK_SOURCE = {
  INTERNAL: 'INTERNAL',
  CUSTOMER_PORTAL: 'CUSTOMER_PORTAL',
} as const;
export type TaskSource = (typeof TASK_SOURCE)[keyof typeof TASK_SOURCE];

/** A unit/site an external customer is tied to (apartment / order / workspace). */
export interface CustomerUnit {
  id: string;
  organizationId: string;
  customerId?: string | null;
  name: string;
  label?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  spaceId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One node of the dynamic intake tree (a problem category → its sub-issues). */
export interface IntakeCategory {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  icon?: string | null;
  color?: string | null;
  urgent: boolean;
  team?: string | null;
  defaultPriority?: string | null;
  issues: string[];
  position: number;
  isActive: boolean;
  spaceId?: string | null;
}

/** Which optional steps/surfaces the portal shows (per org, opt-in). */
export interface PortalFeatureFlags {
  photos: boolean; // ask for photos in the wizard
  access: boolean; // "can we enter if you're out?"
  preferredTime: boolean; // pick a time window
  location: boolean; // ask which sub-location (workplace)
  contact: boolean; // contact-preference step (logistics)
  community: boolean; // announcements tab
  messages: boolean; // message the office/support
  ratings: boolean; // star feedback on completion
}

export const DEFAULT_PORTAL_FEATURES: PortalFeatureFlags = {
  photos: true,
  access: false,
  preferredTime: false,
  location: false,
  contact: false,
  community: true,
  messages: true,
  ratings: true,
};

/** Everything the portal client needs to render intake for one org. */
export interface PortalIntakeConfig {
  entityLabel: string; // "Apartment" | "Order" | "Workspace"
  brandName?: string | null;
  accent?: string | null;
  features: PortalFeatureFlags;
  categories: IntakeCategory[];
  contactLabel?: string | null; // "Leasing Office" | "Support" | "Facilities"
}

export type PreferredTime = 'MORNING' | 'AFTERNOON' | 'EVENING';
export type ContactPreference = 'PUSH' | 'EMAIL' | 'PHONE';

/** Payload a customer submits to open a request (portal client → gateway). */
export interface SubmitRequestInput {
  categoryKey: string;
  issue?: string;
  description?: string;
  unitId?: string; // defaults to the caller's linked unit
  accessPermitted?: boolean;
  preferredTime?: PreferredTime | null;
  contactPreference?: ContactPreference | null;
  photoKeys?: string[]; // fileUrls of already-uploaded attachments
}

export type TimelineState = 'done' | 'active' | 'pending';

/** A request as the customer sees it (derived from a Task). */
export interface CustomerRequestView {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  categoryLabel?: string | null;
  icon?: string | null;
  color?: string | null;
  unitName?: string | null;
  createdAt: string;
  tracked: boolean;
  timeline: { label: string; state: TimelineState; at?: string | null }[];
  // Triage (admin inbox): false = pending triage (no space/flow/worker yet).
  triaged?: boolean;
  spaceId?: string | null;
  spaceName?: string | null;
  assignedToId?: string | null;
  description?: string | null;
}

/** Create a customer portal invitation (office → resident). */
export interface CreateCustomerInviteInput {
  customerId: string;
  unitId?: string;
  email?: string;
  expiresInHours?: number;
}

/** A portal template blueprint (used to seed an org's intake config). */
export interface PortalTemplate {
  key: string;
  vertical: string;
  entityLabel: string;
  contactLabel: string;
  accent: string;
  features: PortalFeatureFlags;
  categories: Array<Omit<IntakeCategory, 'id' | 'organizationId' | 'isActive'> & { isActive?: boolean }>;
}
