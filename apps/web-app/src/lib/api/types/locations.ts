import type { CompanyLocation } from '@hbcfield/shared/client';

// ============================================================================
// LOCATIONS API
// ============================================================================

export interface CreateLocationInput {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  geofenceRadius?: number;
  /**
   * The site's drawn outline. When set it REPLACES the radius — an address
   * geocodes to the front door, so a circle measured from there cannot
   * describe a property with a yard or several buildings. `null` clears it.
   */
  geofencePolygon?: { lat: number; lng: number }[] | null;
  timezone?: string;
  enabledModules?: string[];
  workflowId?: string;
  // Ownership classification + customer contact fields (CUSTOMER kind).
  kind?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  billableRateCents?: number | null;
}


export interface UpdateLocationInput {
  name?: string;
  /** What the client here is billed in; null = the organization's. */
  currency?: string | null;
  /** The company that invoices this workspace; null = the main one. */
  legalEntityId?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  geofenceRadius?: number;
  /**
   * The site's drawn outline. When set it REPLACES the radius — an address
   * geocodes to the front door, so a circle measured from there cannot
   * describe a property with a yard or several buildings. `null` clears it.
   */
  geofencePolygon?: { lat: number; lng: number }[] | null;
  timezone?: string;
  isActive?: boolean;
  enabledModules?: string[];
  workflowId?: string;
  workModel?: string;
  /**
   * The ceiling on working away from this site: STRICT | AWAY_ALLOWED | NONE.
   * Not a permission — it decides what is POSSIBLE here, and the grant on each
   * member decides who may.
   */
  geofencePolicy?: string;
  noShiftPolicy?: string;
  noShiftDailyMinutes?: number;
  /** The staffing floor. 0 = no floor set, which is not "nobody needed". */
  minCover?: number;
  /** The request kinds members may send here (requests/request-kinds.ts). Empty = every kind. */
  requestKinds?: string[];
  kind?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  billableRateCents?: number | null;
  costRateCents?: number | null;
  /** First day a changed rate applies, `YYYY-MM-DD`; default today. */
  rateEffectiveFrom?: string;
  notifyRoleIds?: string[];
  contactRoleIds?: string[];
  approveRoleIds?: string[];
}


export interface LocationAssignment {
  id: string;
  userId: string;
  locationId: string;
  isPrimary: boolean;
  schedule: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    workMode?: string;
    avatarUrl?: string | null;
    isExternal?: boolean;
    /** Access profile — the assignee picker asks canReceiveTasks with it. */
    enabledModules?: unknown;
  };
  location?: CompanyLocation;
  // Server-computed presence: the member's current active task at this location
  // (so employees, who can't read colleagues' tasks, still see who is working).
  currentTask?: string | null;
  currentTaskStatus?: string | null;
}


export interface AssignMemberInput {
  userId: string;
  isPrimary?: boolean;
  schedule?: string[];
  effectiveFrom?: string;
  effectiveTo?: string;
}


export interface UpdateAssignmentInput {
  isPrimary?: boolean;
  schedule?: string[];
  effectiveFrom?: string;
  effectiveTo?: string;
  /**
   * May this member work away from THIS workspace?
   *
   * `true` allows it here, `false` refuses it here even when their account
   * allows it, and `null` clears the override so the account answers again.
   * Omitting the field leaves whatever is there — "no opinion" and "explicitly
   * refused" are different answers.
   */
  allowRemote?: boolean | null;
}
