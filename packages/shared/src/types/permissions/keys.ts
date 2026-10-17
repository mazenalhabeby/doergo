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

/** Human-facing metadata for every permission — drives the role-builder UI. */
export const ACCESS_PERMISSION_SCHEMA: {
  key: AccessPermissionKey;
  label: string;
  description: string;
  domain: PermissionDomain;
  /** Scopes where granting this permission is meaningful. */
  scopes: PermissionGrantScope[];
  /**
   * May an EXTERNAL member hold it (in a space)? Opt-in per key, on purpose: a
   * permission added later is refused to outsiders until somebody decides
   * otherwise here, in a diff.
   */
  external?: true;
}[] = [
  { key: 'canCreateTasks', label: 'Create tasks', description: 'Create new tasks', domain: 'tasks', scopes: ['org', 'space'], external: true },
  { key: 'canViewAllTasks', label: 'View all tasks', description: 'See every task in scope, not just own/assigned', domain: 'tasks', scopes: ['org', 'space'], external: true },
  { key: 'canAssignTasks', label: 'Assign tasks', description: 'Assign tasks to members', domain: 'tasks', scopes: ['org', 'space'], external: true },
  { key: 'canManageUsers', label: 'Manage members', description: 'Invite, edit and remove members (org) / manage this space’s members (space)', domain: 'members', scopes: ['org', 'space'] },
  { key: 'canAddSpaceMembers', label: 'Add people to the workspace', description: 'Add people to this workspace and take them off it', domain: 'members', scopes: ['org', 'space'], external: true },
  { key: 'canGrantSpaceRoles', label: 'Give roles in the workspace', description: 'Choose the role people hold in this workspace — never more than your own', domain: 'members', scopes: ['org', 'space'], external: true },
  { key: 'canViewReports', label: 'View reports', description: 'Build and run reports', domain: 'reports', scopes: ['org', 'space'] },
  { key: 'canApproveOvertime', label: 'Approve overtime', description: 'Approve extra-time requests', domain: 'attendance', scopes: ['org', 'space'], external: true },
  { key: 'canManageRota', label: 'Manage rota', description: 'Create shifts and assign members to shifts', domain: 'attendance', scopes: ['org', 'space'], external: true },
  { key: 'canReconcileAttendance', label: 'Reconcile attendance', description: 'Close/fix open attendance entries', domain: 'attendance', scopes: ['org', 'space'], external: true },
  { key: 'canViewSpaceAttendance', label: 'View attendance', description: 'See attendance for everyone in scope', domain: 'attendance', scopes: ['org', 'space'], external: true },
  { key: 'canApproveAttendance', label: 'Approve attendance', description: 'Approve or reject time entries and time away from the site', domain: 'attendance', scopes: ['org', 'space'], external: true },
  { key: 'canDeleteAttendance', label: 'Delete attendance', description: 'Delete a time entry for good', domain: 'attendance', scopes: ['org', 'space'], external: true },
  // CRM — client relationship management (gated per-space by the `crm` module).
  { key: 'crmViewOwn', label: 'View own clients', description: 'See CRM clients assigned to them', domain: 'crm', scopes: ['org', 'space'], external: true },
  { key: 'crmViewAll', label: 'View all clients', description: 'See every CRM client, not just assigned ones', domain: 'crm', scopes: ['org', 'space'], external: true },
  { key: 'crmWork', label: 'Work clients', description: 'Change pipeline stage and add timeline notes on visible clients', domain: 'crm', scopes: ['org', 'space'], external: true },
  { key: 'crmEditInfo', label: 'Edit client info', description: 'Edit client details, addresses and units', domain: 'crm', scopes: ['org', 'space'], external: true },
  { key: 'crmCreateClients', label: 'Add clients', description: 'Add a new client — without the power to reassign or delete one', domain: 'crm', scopes: ['org', 'space'], external: true },
  { key: 'crmManageClients', label: 'Manage clients', description: 'Reassign ownership and delete/archive clients', domain: 'crm', scopes: ['org', 'space'], external: true },
  { key: 'canManageInvoices', label: 'Customer invoices', description: 'Open customer invoicing and see what has been billed', domain: 'billing', scopes: ['org'] },
  { key: 'canViewLabourCost', label: 'Labour cost and margin', description: 'See what an hour costs as well as what it bills at', domain: 'billing', scopes: ['org'] },
  { key: 'canViewAssets', label: 'View assets', description: 'See equipment, vehicles and their history', domain: 'assets', scopes: ['org', 'space'], external: true },
  { key: 'canLogAssets', label: 'Log asset use', description: 'Record use, fuel and expenses against equipment', domain: 'assets', scopes: ['org', 'space'], external: true },
  { key: 'canManageAssets', label: 'Manage assets', description: 'Delete assets and record money against them', domain: 'assets', scopes: ['org', 'space'], external: true },
  { key: 'canManageWorkspaces', label: 'Manage workspaces', description: 'Create, configure, archive and share workspaces', domain: 'workspaces', scopes: ['org'] },
  { key: 'canViewPortal', label: 'View portal requests', description: 'See the requests clients send through the portal', domain: 'portal', scopes: ['org', 'space'], external: true },
  { key: 'canAnswerPortal', label: 'Answer portal requests', description: 'Reply to portal requests and change their status', domain: 'portal', scopes: ['org', 'space'], external: true },
  { key: 'canManagePortals', label: 'Manage client portals', description: 'Create and configure the portals customers log in to', domain: 'portal', scopes: ['org', 'space'], external: true },
  { key: 'canManageTaskTypes', label: 'Manage task types', description: 'Define task types, statuses and how work flows through them', domain: 'tasks', scopes: ['org'] },
  { key: 'canViewTracking', label: 'View location tracking', description: 'See where field staff are and the routes they travelled', domain: 'tracking', scopes: ['org', 'space'], external: true },
  // Personnel file. Org scope only: a document belongs to a PERSON, not to a
  // site, so granting it per space would say "you may read their payslip while
  // they are working in Laakirchen", which is not a thing anyone means.
  { key: 'canViewMemberDocuments', label: 'See member documents', description: 'See that a member has documents — names and dates only, never the contents', domain: 'documents', scopes: ['org'] },
  { key: 'canOpenMemberDocuments', label: 'Open member documents', description: 'Open and download another member’s documents, including payslips', domain: 'documents', scopes: ['org'] },
  { key: 'canIssueDocuments', label: 'Issue documents', description: 'Upload and publish documents to members, and withdraw them', domain: 'documents', scopes: ['org'] },
  { key: 'canManageDocumentTemplates', label: 'Manage document types', description: 'Define document types, contract templates and retention rules', domain: 'documents', scopes: ['org'] },
  { key: 'canManageDocumentVisibility', label: 'Choose who sees a document', description: 'Hide a document from the member it belongs to, or limit it to certain roles', domain: 'documents', scopes: ['org'] },
  { key: 'canReplaceDocuments', label: 'Replace documents', description: 'Swap a document for a new version and ask for signature again', domain: 'documents', scopes: ['org'] },
  { key: 'canDeleteDocuments', label: 'Delete documents', description: 'Erase documents for good, including signed ones', domain: 'documents', scopes: ['org'] }
];
