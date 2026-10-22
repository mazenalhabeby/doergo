import type { TourDef } from "./types"
import { step } from "./tour-steps"

/** The first-run tours, one per role, and the task list tours. Part of `TOURS`. */
export const WELCOME_TOURS: TourDef[] = [
  // ── ADMIN — the org owner: full navigation + where everything lives ──
  {
    id: "welcomeAdmin",
    titleKey: "tours.welcomeAdmin.title",
    icon: "compass",
    autoRunOn: "/dashboard",
    gate: (c) => c.isAdmin,
    steps: [
      step("welcomeAdmin", "dashboard", "nav-dashboard"),
      { ...step("welcomeAdmin", "yourSpaces", "dash-spaces"), optional: true, dynamic: true }, // the spaces grid on the dashboard
      // ── Deep dive into an opened space (each step skips fast if that group is empty) ──
      {
        ...step("welcomeAdmin", "spaceHeader", "dash-space-header"),
        enter: "dash-space-box",
        optional: true,
      }, // live headcount (opens the space)
      { ...step("welcomeAdmin", "openSpace", "dash-space-members"), optional: true }, // on-site team (present now)
      {
        ...step("welcomeAdmin", "member", "dash-space-member"),
        optional: true,
      }, // one teammate → tap to message / see jobs / manage access
      { ...step("welcomeAdmin", "field", "dash-space-field"), optional: true }, // out on a job
      { ...step("welcomeAdmin", "offSite", "dash-space-offsite"), optional: true }, // working remotely
      { ...step("welcomeAdmin", "offDuty", "dash-space-offduty"), optional: true }, // off today + reason
      { ...step("welcomeAdmin", "spaceActions", "dash-space-actions"), optional: true }, // manage / add member / view tasks
      // ── The live right-hand panel: activity feed + things needing your attention ──
      { ...step("welcomeAdmin", "activity", "dash-activity"), optional: true, dynamic: true },
      { ...step("welcomeAdmin", "pending", "dash-pending"), optional: true, dynamic: true },
      step("welcomeAdmin", "tasks", "nav-tasks"),
      step("welcomeAdmin", "team", "nav-team"),
      step("welcomeAdmin", "spaces", "nav-spaces"),
      step("welcomeAdmin", "reports", "nav-reports"),
      step("welcomeAdmin", "command", "nav-command"),
      step("welcomeAdmin", "notifications", "nav-notifications"),
      step("welcomeAdmin", "help", "nav-support"),
      step("welcomeAdmin", "profile", "nav-profile"),
    ],
  },

  // ── MANAGER / DISPATCHER — sees all tasks, assigns & tracks ──
  {
    id: "welcomeManager",
    titleKey: "tours.welcomeManager.title",
    icon: "compass",
    autoRunOn: "/dashboard",
    gate: (c) => !c.isAdmin && c.hasPermission("canViewAllTasks"),
    steps: [
      step("welcomeManager", "dashboard", "nav-dashboard"),
      step("welcomeManager", "tasks", "nav-tasks"),
      step("welcomeManager", "schedule", "nav-time-attendance"),
      step("welcomeManager", "attendance", "nav-time-attendance"),
      step("welcomeManager", "reports", "nav-reports"),
      step("welcomeManager", "command", "nav-command"),
      step("welcomeManager", "help", "nav-support"),
      step("welcomeManager", "profile", "nav-profile"),
    ],
  },

  // ── EMPLOYEE (web) — their own jobs, attendance & time off ──
  // Two dashboard variants exist: a compact landing (greeting + contacts + my
  // jobs) for tasks-only/unassigned members, and the spaces grid for
  // space-assigned members. All variant-specific steps are `optional` so
  // whichever one renders is covered and the rest skip fast.
  {
    id: "welcomeEmployee",
    titleKey: "tours.welcomeEmployee.title",
    icon: "compass",
    autoRunOn: "/dashboard",
    gate: (c) => !c.isAdmin && !c.hasPermission("canViewAllTasks"),
    steps: [
      step("welcomeEmployee", "dashboard", "nav-dashboard"),
      // Compact landing (tasks-only / unassigned member).
      { ...step("welcomeEmployee", "yourWork", "dash-emp-tasks"), optional: true, dynamic: true },
      { ...step("welcomeEmployee", "contacts", "dash-emp-contacts"), optional: true, dynamic: true },
      // Spaces grid (space-assigned member).
      { ...step("welcomeEmployee", "yourSpaces", "dash-spaces"), optional: true, dynamic: true },
      { ...step("welcomeEmployee", "openSpace", "dash-space-members"), enter: "dash-space-box", optional: true },
      // Navigation.
      step("welcomeEmployee", "tasks", "nav-tasks"),
      { ...step("welcomeEmployee", "attendance", "nav-my-attendance"), optional: true },
      { ...step("welcomeEmployee", "timeOff", "nav-my-timeoff"), optional: true },
      step("welcomeEmployee", "command", "nav-command"),
      step("welcomeEmployee", "help", "nav-support"),
      step("welcomeEmployee", "profile", "nav-profile"),
    ],
  },

  // ── DEEPER: Jobs screen — create your first job (do-it-with-me) ──
  {
    id: "tasksTour",
    titleKey: "tours.tasksTour.title",
    icon: "tasks",
    autoRunOn: "/tasks",
    autoRunExact: true,
    gate: (c) => c.hasPermission("canCreateTasks"),
    steps: [
      step("tasksTour", "search", "tasks-search"),
      // Switch to each view and spotlight the real content (skipped fast on an
      // empty org that has no jobs to show yet).
      { ...step("tasksTour", "board", "tasks-board"), enter: "tasks-view-board", optional: true },
      { ...step("tasksTour", "list", "tasks-list"), enter: "tasks-view-list", optional: true },
      { ...step("tasksTour", "schedule", "tasks-schedule"), enter: "tasks-view-schedule", optional: true },
      { ...step("tasksTour", "views", "tasks-views"), enter: "tasks-view-list" }, // reset to list + recap the toggle
      { ...step("tasksTour", "create", "tasks-create"), action: "click" }, // opens the dialog
      step("tasksTour", "title", "tasks-dialog-title"), // continues INSIDE the modal
      step("tasksTour", "save", "tasks-dialog-save"),
    ],
  },

  // ── EMPLOYEE Jobs screen — find & work your assigned jobs ──
  // Mutually exclusive with tasksTour (which is create-gated); an employee who
  // can't create tasks gets this lighter list-focused walkthrough instead.
  {
    id: "tasksEmployeeTour",
    titleKey: "tours.tasksEmployeeTour.title",
    icon: "tasks",
    autoRunOn: "/tasks",
    autoRunExact: true,
    gate: (c) => !c.hasPermission("canCreateTasks"),
    steps: [
      step("tasksEmployeeTour", "intro", "tasks-search"),
      step("tasksEmployeeTour", "views", "tasks-views"),
      { ...step("tasksEmployeeTour", "list", "tasks-list"), enter: "tasks-view-list", optional: true },
    ],
  },
]
