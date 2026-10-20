/** Every route and who may open it (moved here unchanged) */
import { hasAccessModule } from '@hbcfield/shared/client';
import { APPROVAL_DECIDE_GRANTS, MANAGE_USERS, OPEN, crmAccess, option, type AccessRule } from './rules';

/**
 * Every page under app/(dashboard), by its route pattern (`[x]` = one segment).
 *
 * A test walks this against the folder: a page without an entry, or an entry
 * without a page, fails it.
 */
export const ROUTE_RULES: Readonly<Record<string, AccessRule>> = {
  "/dashboard": OPEN,
  // Old addresses (/employees, /schedule's old home, /profile, /sprints, /task-types,
  // /join-requests) are real 308 redirects in next.config.ts, not pages.

  // ── Work ──
  "/tasks": OPEN,
  "/tasks/[id]": { why: "GET /tasks/:id — the task service decides who may read the task" },
  "/tasks/[id]/report": { why: "GET /tasks/:id/full-report — checked against the task" },
  "/tasks/recurring": {
    need: ["admin"], option: "recurring",
    why: "GET /recurring-tasks; the page manages schedules for admins only (non-admins were pushed to /dashboard)",
  },
  "/issues": { why: "GET /shift-issues — @Roles(ADMIN, EMPLOYEE); a member sees what they reported, an overseer their sites" },
  "/calendar": { denyExternal: true, why: "CalendarController — @Roles(ADMIN, EMPLOYEE) @DenyExternal()" },
  "/team": { why: "GET /locations/team — teammates in the caller's own workspaces" },
  "/messages": {
    why: "GET /chat/conversations — the caller's own conversations; who may be written to is chat's rule (task-service chat-reach)",
  },
  "/manage": {
    when: ({ user }) => hasAccessModule(user as never, "manage"),
    why: "the Manage hub — the member's access profile carries the `manage` screen",
  },
  "/shared/[id]": { need: ["org:canViewAllTasks"], why: "GET /shared-spaces — @RequirePermission('canViewAllTasks')" },

  // ── Workspaces ──
  "/locations": {
    need: [["org:canManageWorkspaces", "org:canManageUsers", "any:canViewAllTasks", "any:canViewSpaceAttendance"]],
    why: "GET /locations is service-scoped; the list is for whoever runs or oversees a workspace",
  },
  "/locations/[id]": { why: "the page checks canManageSpace for THIS workspace and says so itself" },
  "/locations/[id]/portals/[portalId]": {
    need: ["any:canViewPortal"], module: "b2c_portal",
    why: "GET /portal/admin/portals/:id — @RequirePermissionInSpace('canViewPortal'), narrowed to the portal's workspace",
  },

  // ── Clients, equipment, portals — per workspace, by permission ──
  // An external member reaches these through a grant in their one workspace
  // (the permission builder); the server narrows every read to it.
  "/clients": {
    module: "crm", when: ({ user }) => crmAccess(user),
    why: "GET /customers — CRM caps, org-wide or per workspace (crmReachOf), narrowed in the service",
  },
  "/clients/[id]": {
    when: ({ user }) => crmAccess(user),
    why: "GET /customers/:id — CRM caps + reach in the service (404 outside it)",
  },
  "/assets": {
    module: "assets", need: ["any:canViewAssets"],
    why: "GET /assets — @RequireModule('assets') @RequirePermissionInSpace('canViewAssets')",
  },
  "/assets/[id]": {
    module: "assets", need: ["any:canViewAssets"],
    why: "GET /assets/:id — @RequirePermissionInSpace('canViewAssets'), narrowed by the asset's kind's workspace",
  },
  "/portals": {
    module: "b2c_portal", need: ["any:canViewPortal"],
    why: "GET /spaces/:id/portal/portals — @RequirePermissionInSpace('canViewPortal')",
  },

  // ── People ──
  "/members": { need: MANAGE_USERS, why: "GET /organizations/members + /roles — @RequirePermission('canManageUsers')" },
  "/members/[id]": { need: MANAGE_USERS, why: "GET /organizations/members/:id — @RequirePermission('canManageUsers')" },
  "/members/phone-sync": {
    need: MANAGE_USERS, when: ({ user }) => user.offlineMode === true,
    why: "GET /sync/health — @RequirePermission('canManageUsers'); only meaningful with offline mode on",
  },
  "/invitations": { need: MANAGE_USERS, why: "GET /invitations — @RequirePermission('canManageUsers')" },
  "/members/new": {
    need: ["any:canViewAllTasks"],
    why: "POST /employees — the page's own gate (admin or canViewAllTasks, in a workspace or org-wide)",
  },
  "/schedule": {
    denyExternal: true, option: option("/schedule"),
    need: [["any:canViewAllTasks", "any:canManageRota"]],
    why: "GET /employees/time-off — @RequirePermissionInSpace('canViewAllTasks'); the rota is the Shift Scheduling Option",
  },

  "/members/leave-opening": {
    denyExternal: true,
    need: ["any:canManageRota"],
    why: "GET/POST /employees/leave-opening — @RequirePermissionInSpace('canManageRota'); the service narrows to the caller's workspaces",
  },

  // ── Decisions ──
  "/approvals": {
    // Any ONE kind it can decide: every kind's own decide permission, asked the
    // way its route asks it (org-wide for documents, joiners, guest workspaces).
    need: [APPROVAL_DECIDE_GRANTS],
    why: "GET /approvals — open to every member, but it lists only what the caller can decide (each kind's own guard, run as them)",
  },

  // ── Time ──
  "/attendance": {
    need: ["any:canViewSpaceAttendance"],
    why: "GET /attendance/all-entries, /approvals/pending, /no-shows — @RequirePermissionInSpace('canViewSpaceAttendance')",
  },
  "/overtime": {
    need: ["any:canApproveOvertime"], option: option("/overtime"),
    why: "GET /overtime/* — @RequirePermissionInSpace('canApproveOvertime'), reads included",
  },
  "/my/attendance": {
    when: ({ user }) => hasAccessModule(user as never, "clock"),
    why: "the member's own shifts — the `clock` screen of their access profile",
  },
  "/my/time-off": {
    when: ({ user }) => hasAccessModule(user as never, "time_off"),
    why: "the member's own leave — the `time_off` screen of their access profile",
  },

  // ── Documents (the Option gates the pages; the server passes reads by design) ──
  "/my/documents": { option: "documents", why: "the member's own file — no permission, the Option only" },
  "/my/documents/[id]/sign": { option: "documents", why: "signing a document routed to the member — being on the step is the authority" },
  "/documents": {
    option: "documents", need: ["org:canIssueDocuments"],
    why: "GET /documents/match-candidates, /drafts — @RequirePermission('canIssueDocuments')",
  },
  "/documents/review": {
    option: "documents", need: ["org:canIssueDocuments"],
    why: "GET /documents/awaiting-verification — @RequirePermission('canIssueDocuments')",
  },
  "/documents/all": {
    option: "documents", need: ["org:canViewMemberDocuments"],
    why: "GET /documents/sent, /browse — @RequirePermission('canViewMemberDocuments')",
  },
  "/documents/templates": {
    option: "documents", need: ["org:canManageDocumentTemplates"],
    why: "GET /documents/templates — @RequirePermission('canManageDocumentTemplates')",
  },
  "/documents/types": {
    option: "documents", need: ["org:canManageDocumentTemplates"],
    why: "GET /documents/types?all=true — the catalogue's editor, the same permission as templates",
  },
  "/documents/compliance": {
    option: "documents", need: ["any:canAssignTasks"], denyExternal: true,
    why: "GET /documents/compliance — @RequirePermissionInSpace('canAssignTasks') @DenyExternal() (the personnel file)",
  },

  // ── Money & reading ──
  "/reports": {
    denyExternal: true, need: [["any:canViewAllTasks", "any:canViewReports"]],
    why: "AnalyticsController — @DenyExternal() + ReportAccessGuard (canViewAllTasks or canViewReports, anywhere)",
  },
  "/reports/job-time": OPEN,
  "/invoices": {
    option: option("/invoices"), need: ["org:canManageInvoices"],
    why: "GET /invoices — @RequirePermission('canManageInvoices')",
  },
  "/invoices/new": { option: option("/invoices"), need: ["org:canManageInvoices"], why: "as /invoices" },
  "/invoices/[id]": { option: option("/invoices"), need: ["org:canManageInvoices"], why: "GET /invoices/:id — as /invoices" },
  "/invoices/[id]/edit": { option: option("/invoices"), need: ["org:canManageInvoices"], why: "as /invoices/[id]" },

  // ── Settings ──
  "/settings": OPEN, // the sections inside are checked by SETTINGS_SECTION_RULES
  "/settings/billing": { denyExternal: true, why: "GET /billing/bill — @DenyExternal(); reading is open, changing it is ADMIN" },
  // The audit log is a section of /settings (SETTINGS_SECTION_RULES["audit-log"]); /settings/audit-log is a 308.
}
