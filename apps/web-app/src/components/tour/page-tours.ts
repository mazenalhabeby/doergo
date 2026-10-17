import type { TourDef } from "./types"
import { step, pageTour } from "./tour-steps"

/** The tours of single pages: members, workspaces, attendance, reports, a task, leave, settings, availability, a member. Part of `TOURS`, moved here unchanged. */
export const PAGE_TOURS: TourDef[] = [
  // ── DEEPER: Members screen — grow your team ──
  {
    id: "membersTour",
    titleKey: "tours.membersTour.title",
    icon: "team",
    autoRunOn: "/members",
    autoRunExact: true,
    gate: (c) => c.hasPermission("canManageUsers"),
    steps: [
      step("membersTour", "search", "members-search"),
      { ...step("membersTour", "invite", "members-invite"), action: "click" }, // opens the invite dialog
      step("membersTour", "send", "members-invite-send"), // continues INSIDE the modal
    ],
  },

  // ── DEEPER: Spaces (locations) — how work is grouped ──
  {
    id: "spacesTour",
    titleKey: "tours.spacesTour.title",
    icon: "spaces",
    autoRunOn: "/locations",
    autoRunExact: true,
    gate: (c) => c.isAdmin,
    steps: [
      step("spacesTour", "intro", "spaces-intro"),
      // Anatomy of a space card + its actions (skip on an empty org with no spaces).
      { ...step("spacesTour", "card", "spaces-card"), optional: true },
      { ...step("spacesTour", "configure", "spaces-card-configure"), optional: true },
      { ...step("spacesTour", "viewTasks", "spaces-card-viewtasks"), optional: true },
      { ...step("spacesTour", "actions", "spaces-card-actions"), optional: true },
      // Create flow — opens the dialog, then walks every field.
      { ...step("spacesTour", "create", "spaces-create"), action: "click" }, // opens the new-space dialog
      step("spacesTour", "name", "spaces-dialog-name"), // continues INSIDE the modal
      { ...step("spacesTour", "type", "spaces-form-type"), optional: true },
      // Select "Physical" to reveal address + map + geofence, then spotlight it.
      { ...step("spacesTour", "physical", "spaces-form-physical"), enter: "spaces-form-type-physical", optional: true },
      { ...step("spacesTour", "workflow", "spaces-form-workflow"), optional: true },
      { ...step("spacesTour", "modules", "spaces-form-modules"), optional: true },
      { ...step("spacesTour", "submit", "spaces-form-submit"), optional: true },
    ],
  },

  // ── DEEPER: Attendance — header actions + all three tabs ──
  {
    id: "attendanceTour",
    titleKey: "tours.attendanceTour.title",
    icon: "attendance",
    autoRunOn: "/attendance",
    autoRunExact: true,
    gate: (c) => c.hasPermission("canViewAllTasks"),
    steps: [
      step("attendanceTour", "intro", "attendance-header"),
      { ...step("attendanceTour", "addDayOff", "add-dayoff-button"), optional: true },
      { ...step("attendanceTour", "addAttendance", "add-attendance-button"), optional: true },
      step("attendanceTour", "tabs", "attendance-tabs"),
      // Tracking tab (default view)
      { ...step("attendanceTour", "trackingStats", "tracking-stats"), optional: true },
      { ...step("attendanceTour", "trackingFilters", "tracking-filters"), optional: true },
      { ...step("attendanceTour", "trackingTable", "tracking-table"), optional: true },
      // Approvals tab — spotlight the tab, then switch to it (controlled onClick).
      { ...step("attendanceTour", "approvalsTab", "attendance-tab-approvals"), optional: true },
      { ...step("attendanceTour", "approvals", "approvals-content"), enter: "attendance-tab-approvals", optional: true },
      // Breaks tab
      { ...step("attendanceTour", "breaksTab", "attendance-tab-breaks"), optional: true },
      { ...step("attendanceTour", "breaks", "breaks-content"), enter: "attendance-tab-breaks", optional: true },
    ],
  },

  // ── DEEPER: Reports — build, run & export ──
  {
    id: "reportsTour",
    titleKey: "tours.reportsTour.title",
    icon: "reports",
    autoRunOn: "/reports",
    autoRunExact: true,
    gate: (c) => c.hasPermission("canViewAllTasks") || c.hasPermission("canViewReports"),
    steps: [
      step("reportsTour", "intro", "reports-header"),
      { ...step("reportsTour", "saved", "reports-saved-list"), optional: true },
      step("reportsTour", "builder", "reports-builder"),
      // Open the builder (clicks the Report builder button) then walk each control.
      { ...step("reportsTour", "dataset", "reports-dataset"), enter: "reports-builder", optional: true },
      { ...step("reportsTour", "measures", "reports-measures"), optional: true },
      { ...step("reportsTour", "dimensions", "reports-dimensions"), optional: true },
      { ...step("reportsTour", "period", "reports-period"), optional: true },
      { ...step("reportsTour", "run", "reports-run"), optional: true },
      { ...step("reportsTour", "results", "reports-results"), optional: true },
      { ...step("reportsTour", "save", "reports-save"), optional: true },
      { ...step("reportsTour", "export", "reports-export"), optional: true },
    ],
  },

  // ── DEEPER: Task detail — how to work a single job ──
  // Prefix-matches any /tasks/<id> (the trailing slash excludes the /tasks list).
  {
    id: "taskDetailTour",
    titleKey: "tours.taskDetailTour.title",
    icon: "tasks",
    autoRunOn: "/tasks/",
    steps: [
      // Left column, top → bottom. Module/condition-gated sections are optional so
      // they skip fast when that feature isn't on the plan or on this job.
      step("taskDetailTour", "header", "task-header"),
      step("taskDetailTour", "progress", "task-progress"),
      step("taskDetailTour", "description", "task-description"),
      { ...step("taskDetailTour", "subtasks", "task-subtasks"), optional: true },
      { ...step("taskDetailTour", "checklist", "task-checklist"), optional: true },
      { ...step("taskDetailTour", "attachments", "task-attachments"), optional: true },
      { ...step("taskDetailTour", "dependencies", "task-dependencies"), optional: true },
      { ...step("taskDetailTour", "customFields", "task-custom-fields"), optional: true },
      step("taskDetailTour", "comments", "task-comments"),
      step("taskDetailTour", "activity", "task-activity"),
      { ...step("taskDetailTour", "serviceReport", "task-service-report"), optional: true },
      { ...step("taskDetailTour", "routeTracking", "task-route-tracking"), optional: true },
      // Right sidebar
      step("taskDetailTour", "sidebar", "task-sidebar"),
      { ...step("taskDetailTour", "agile", "task-agile"), optional: true },
    ],
  },

  // ── PAGE HINTS — a one-line "what is this screen" guide on every page. ──
  // (pageEmployees retired — /employees redirects to /members.)
  ...pageTour("pageInvoices", "invoices", "reports", "/invoices", "page-invoices", (c) => c.isAdmin),
  ...pageTour("pageAssets", "assets", "spaces", "/assets", "page-assets", (c) => c.hasPermission("canViewAssets")),
  // Time Off (your own) — request flow + your requests list.
  {
    id: "pageMyTimeoff",
    titleKey: "tours.myTimeoffTour.title",
    icon: "schedule",
    autoRunOn: "/my/time-off",
    autoRunExact: true,
    steps: [
      step("myTimeoffTour", "intro", "page-my-timeoff"),
      step("myTimeoffTour", "form", "timeoff-form"),
      step("myTimeoffTour", "dates", "timeoff-dates"),
      step("myTimeoffTour", "reason", "timeoff-reason"),
      step("myTimeoffTour", "submit", "timeoff-submit"),
      step("myTimeoffTour", "requests", "timeoff-requests"),
    ],
  },
  // My Attendance (your own) — clock in/out, current status, recent entries.
  {
    id: "myAttendanceTour",
    titleKey: "tours.myAttendanceTour.title",
    icon: "attendance",
    autoRunOn: "/my/attendance",
    autoRunExact: true,
    steps: [
      step("myAttendanceTour", "intro", "page-my-attendance"),
      step("myAttendanceTour", "clock", "my-attn-clock"),
      { ...step("myAttendanceTour", "status", "my-attn-status"), optional: true },
      { ...step("myAttendanceTour", "history", "my-attn-history"), optional: true },
    ],
  },
  ...pageTour("pageInvitations", "invitations", "invite", "/invitations", "page-invitations", (c) => c.hasPermission("canManageUsers")),
  ...pageTour("pageOvertime", "overtime", "attendance", "/overtime", "page-overtime", (c) => c.hasPermission("canApproveOvertime") || c.hasPermission("canViewAllTasks")),
  ...pageTour("pageManage", "manage", "settings", "/manage", "page-manage"),
  // Settings — Organization + Personal sections (org steps skip for non-admins).
  {
    id: "pageSettings",
    titleKey: "tours.settingsTour.title",
    icon: "settings",
    autoRunOn: "/settings",
    autoRunExact: true,
    steps: [
      step("settingsTour", "intro", "page-settings"),
      { ...step("settingsTour", "orgGroup", "settings-org-group"), optional: true },
      { ...step("settingsTour", "general", "settings-general"), enter: "settings-nav-general", optional: true },
      { ...step("settingsTour", "members", "settings-members"), enter: "settings-nav-members", optional: true },
      { ...step("settingsTour", "notifications", "settings-notifications"), enter: "settings-nav-notifications", optional: true },
      // No task-types step: they are not in Organization Settings at all. They
      // belong to the space that runs the work, and the spaces tour covers them.
      { ...step("settingsTour", "audit", "settings-audit"), enter: "settings-nav-audit-log", optional: true },
      step("settingsTour", "personalGroup", "settings-personal-group"),
      { ...step("settingsTour", "profile", "settings-profile"), enter: "settings-nav-profile", optional: true },
      { ...step("settingsTour", "security", "settings-security"), enter: "settings-nav-security", optional: true },
    ],
  },
  // ── DEEPER: Schedule / Availability (the /schedule redirect target) ──
  // Exact-match availability MUST precede the /employees/ prefix detail tour below.
  {
    id: "pageAvailability",
    titleKey: "tours.availabilityTour.title",
    icon: "schedule",
    autoRunOn: "/employees/availability",
    autoRunExact: true,
    gate: (c) => c.hasPermission("canViewAllTasks"),
    steps: [
      step("availabilityTour", "intro", "page-availability"),
      { ...step("availabilityTour", "summary", "avail-summary"), optional: true },
      { ...step("availabilityTour", "view", "avail-view"), optional: true },
      { ...step("availabilityTour", "space", "avail-space"), optional: true },
      { ...step("availabilityTour", "dateNav", "avail-datenav"), optional: true },
      { ...step("availabilityTour", "tabs", "avail-tabs"), optional: true },
      { ...step("availabilityTour", "calendar", "avail-calendar"), optional: true },
      // Open a populated day to reveal the per-person detail panel, then spotlight it.
      { ...step("availabilityTour", "dayDetail", "avail-daydetail"), enter: "avail-day", optional: true },
      { ...step("availabilityTour", "legend", "avail-legend"), optional: true },
      { ...step("availabilityTour", "timeoffTab", "avail-timeoff-tab"), optional: true },
      // Switch to the Time-Off tab (controlled onClick on the trigger) and show the requests.
      { ...step("availabilityTour", "timeoff", "avail-timeoff"), enter: "avail-timeoff-tab", optional: true },
    ],
  },

  // Detail pages — prefix routes (trailing slash excludes the list route).
  // (employeeDetailTour retired — /employees/[id] now redirects to /members/[id];
  //  the member detail tour below covers the consolidated page.)
  // Member detail — profile + a DEEP walk of the Access tab (every permission).
  {
    id: "memberDetailTour",
    titleKey: "tours.memberDetailTour.title",
    icon: "team",
    autoRunOn: "/members/",
    gate: (c) => c.hasPermission("canManageUsers"),
    steps: [
      step("memberDetailTour", "profile", "page-member"),
      { ...step("memberDetailTour", "tasks", "member-tasks"), optional: true },
      // The Access tab only exists for admins viewing a non-admin member. Spotlight
      // it, then open it (enter) and walk every access control. All optional so the
      // whole access section skips cleanly when there's no Access tab (self / admin).
      { ...step("memberDetailTour", "accessTab", "access-tab"), optional: true },
      { ...step("memberDetailTour", "platform", "access-platform"), enter: "access-tab", optional: true },
      { ...step("memberDetailTour", "permissions", "access-permissions"), optional: true },
      { ...step("memberDetailTour", "features", "access-features"), optional: true },
      { ...step("memberDetailTour", "attendance", "access-attendance"), optional: true },
      { ...step("memberDetailTour", "spaces", "access-spaces"), optional: true },
      { ...step("memberDetailTour", "collaboration", "access-collaboration"), optional: true },
      { ...step("memberDetailTour", "contact", "access-contact"), optional: true },
      { ...step("memberDetailTour", "management", "access-management"), optional: true },
      { ...step("memberDetailTour", "watchers", "access-watchers"), optional: true },
      { ...step("memberDetailTour", "save", "access-save"), optional: true },
    ],
  },
]
