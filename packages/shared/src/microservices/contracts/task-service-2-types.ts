/**
 * Shapes the task-service-2 contracts share (assets, chat, space roles, analytics,
 * support, planning items). Moved here from the services, which keep their old
 * names as aliases — one declaration, read by the gateway and the service alike.
 */

/**
 * Who is acting on the register, and in which workspaces — as the gateway's
 * `assetActor` builds it from the verified session.
 *
 * Each level is a workspace list with three states: `null` = org-wide, an
 * array = only those workspaces, `[]` = nowhere. ⚠️ A level that is MISSING is
 * read as nowhere, never as everywhere: a caller that forgot to forward it (a
 * new route, a queue job built by hand) must lose access, not gain the whole
 * organization's register. That is the opposite of what `undefined` used to
 * mean on the contract flow, and it is the safe one.
 */
export interface AssetActorMessage {
  userId: string;
  userRole: string;
  organizationId: string;
  /** A client's or partner's person — holds no custody, whatever the rows say. */
  isExternal?: boolean;
  /** Read records, their history, money, custody and logbook. */
  viewSpaceIds?: string[] | null;
  /** Add logbook entries and file expenses. */
  logSpaceIds?: string[] | null;
  /** Create, edit, delete, hand over, money rows, contracts, proposals. */
  manageSpaceIds?: string[] | null;
  /**
   * Manages assets ORG-WIDE. Read by the shared entry-date rule (the
   * backdating exemption) and by "may name somebody else as the holder" —
   * both org-wide by definition, so a workspace grant never satisfies them.
   */
  canManageAssets?: boolean;
}

/** What a client sends: the reading, after a person has corrected it. */
export interface ContractFieldsMessage {
  name?: string;
  registration?: string;
  vin?: string;
  serial?: string;
  manufacturer?: string;
  model?: string;
  startsOn?: string;
  endsOn?: string;
}

/** The person acting on a chat group. */
export type ChatActorMessage = { userId: string; organizationId: string };

/**
 * What the caller may change about people in THIS workspace, decided at the
 * gateway from the route's space (`mayAddSpaceMembers`, `mayGrantSpaceRoles`,
 * `mayManageSpaceMembers`) and enforced here, where the role's kind is known.
 * Absent = all three (internal callers and tests that predate the split).
 */
export interface SpaceMemberAuthorityMessage {
  /** Put a person into the workspace, or take them off it. */
  addMembers: boolean;
  /** Choose the MANAGEMENT role somebody holds here (the ceiling still applies). */
  grantRoles: boolean;
  /** Trades, billing terms and routing — `canManageUsers` here; never an external member. */
  manageTerms: boolean;
}

export type ReportGranularityMessage = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type ReportDatePresetMessage =
  'last_7d' | 'last_30d' | 'last_90d' | 'this_month' | 'last_month' | 'this_year' | 'all';

export interface ReportFilterMessage {
  field: string; // dimension key
  op: 'eq' | 'neq' | 'in';
  value: string | number | Array<string | number>;
}

export interface ReportDefinitionMessage {
  dataset: string;
  measures: string[];
  dimensions?: string[];
  granularity?: ReportGranularityMessage;
  dateRange?: { preset?: ReportDatePresetMessage; from?: string; to?: string };
  filters?: ReportFilterMessage[];
  sort?: { key: string; dir: 'asc' | 'desc' };
  limit?: number;
}

export type ReportCadenceMessage = 'daily' | 'weekly' | 'monthly';

export interface ReportScheduleInputMessage {
  cadence: ReportCadenceMessage;
  hour?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipients: string[];
  isActive?: boolean;
}

export type SupportAttachmentMessage = { fileName: string; fileUrl: string; fileType: string; fileSize: number };

/** What every planning item (an epic, a phase) carries. */
export interface PlanningItemInputMessage {
  name?: string;
  description?: string;
  color?: string;
  startDate?: string;
  position?: number;
}
