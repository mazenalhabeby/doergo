/** The permission keys, their types and the schema every screen and check reads. */

/**
 * UNIFIED PERMISSION MODEL
 * ============================================================================
 * ONE permission vocabulary spanning every domain (tasks / members / reports /
 * attendance), used by BOTH org-wide roles and per-space roles. This is the
 * superset that replaces the two disjoint legacy sets:
 *   • User flags  (canCreateTasks, canViewAllTasks, canAssignTasks, canManageUsers, canViewReports)
 *   • SpaceRole   (canApproveOvertime, canManageRota, canReconcileAttendance, canViewSpaceAttendance)
 *
 * A `Role` (org or space scoped) holds a `PermissionSet`; a member's effective
 * access = their org role ∪ every space role they hold (resolved in Phase 2).
 *
 * Phase 1: this vocabulary + the mappers below let us backfill legacy data into
 * the unified `Role`/`SpaceAssignment` tables WITHOUT changing any behavior yet.
 */

/** Every permission key, flat camelCase (superset of the two legacy shapes). */
export const PERMISSION_KEYS = [
  // Tasks
  'canCreateTasks',
  'canViewAllTasks',
  'canAssignTasks',
  // Members
  'canManageUsers',
  // Reports
  'canViewReports',
  // Attendance (formerly space-only)
  'canApproveOvertime',
  'canManageRota',
  'canReconcileAttendance',
  'canViewSpaceAttendance',
  // Approving an entry and correcting one are different trusts — a client's
  // supervisor signs off our hours without being able to rewrite them — and
  // erasing one is a third. All three rode on canReconcileAttendance.
  'canApproveAttendance',
  'canDeleteAttendance',
  // CRM (clients). View scope is two keys: own ⊂ all (viewAll implies viewOwn).
  'crmViewOwn',
  'crmViewAll',
  'crmWork', // change pipeline stage + add timeline notes on visible clients
  'crmEditInfo', // edit client details / addresses / units
  'crmCreateClients', // add a client — WITHOUT the power to delete or reassign one
  'crmManageClients', // reassign owner/managers, delete/archive (and implies create)
  // Billing & assets. Split out of canManageUsers / canViewAllTasks, which between
  // them gated 210 endpoints — "can manage members" also meant "can invoice
  // customers and delete assets", so a bookkeeper could not be given the first
  // without the second.
  'canManageInvoices',
  // What labour COSTS, as opposed to what it is billed at. Split from
  // canManageInvoices because they are different people: whoever raises an
  // invoice needs the bill rate and the margin is none of their business,
  // while an owner reading margin has no reason to issue anything.
  'canViewLabourCost',
  'canManageAssets',
  // Reading the equipment and logging what was done with it. Reads rode on
  // canViewAllTasks — a task permission — so "see the jobs" also meant "see the
  // vans", and nothing short of canManageAssets could log a refuel.
  'canViewAssets',
  'canLogAssets',
  // Creating and configuring workspaces — the space itself, its roles, and who
  // outside the organization may see it. Split out of canManageUsers, where
  // "invite a colleague" and "delete a site" were the same grant.
  'canManageWorkspaces',
  // Client portals — the B2B2C surface. 41 endpoints rode on canManageUsers,
  // so "invite a colleague" also meant "publish a portal to your customers".
  'canManagePortals',
  // Reading a portal's requests and answering them, without configuring the
  // portal itself — what a client's site manager does all day.
  'canViewPortal',
  'canAnswerPortal',
  // A workspace's own people: adding them, and choosing their role there. Rode
  // on canManageUsers, which in a space ALSO sets what each person bills at.
  'canAddSpaceMembers',
  'canGrantSpaceRoles',
  // The office's approval rules (who must also approve, and the chase when nobody answers). Split out of
  // canManageUsers so a manager or secretary can keep the rules without managing people; held in a
  // workspace it covers only that workspace's rules.
  'canManageApprovalRules',
  // Task-type / workflow definitions: which statuses exist and how work flows.
  'canManageTaskTypes',
  // Where staff physically are. Split from canViewAllTasks because reading a
  // task list and tracking a person's location are not the same permission.
  'canViewTracking',
  // The personnel file. Split three ways on purpose: seeing THAT a colleague has
  // documents, OPENING one, and ISSUING them are different powers. A dispatcher
  // needs the first to schedule around a lapsed certificate and the second never
  // — a payslip is the most sensitive object in this product.
  'canViewMemberDocuments',
  'canOpenMemberDocuments',
  'canIssueDocuments',
  'canManageDocumentTemplates',
  // Control over ONE document, split from issuing because each is a bigger power
  // than the last: choosing who sees it, swapping it for a new version, and
  // erasing it — signatures included — are three separate trusts.
  'canManageDocumentVisibility',
  'canReplaceDocuments',
  'canDeleteDocuments',
] as const;

export type AccessPermissionKey = (typeof PERMISSION_KEYS)[number];

/** A set of granted permissions. Missing key = not granted (treated as false). */
export type PermissionSet = Partial<Record<AccessPermissionKey, boolean>>;

/** Where a permission may be granted. */
export type PermissionGrantScope = 'org' | 'space';

/** Domain grouping for UI. */
export type PermissionDomain =
  | 'tasks'
  | 'members'
  | 'reports'
  | 'attendance'
  | 'crm'
  | 'portal'
  | 'billing'
  | 'assets'
  | 'workspaces'
  | 'tracking'
  | 'documents';

export { ACCESS_PERMISSION_SCHEMA } from './schema';
