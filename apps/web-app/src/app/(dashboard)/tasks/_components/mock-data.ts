/**
 * Mock data for the tasks page.
 * Demonstrates space-centric architecture with different workflows and modules per space.
 * Remove this file after real API integration.
 */

import type { Task, Phase, Sprint, Epic } from "@/lib/api"

// ─── Mock Spaces ─────────────────────────────────────────────────────────────
// Each space has different modules enabled (simulated in useSpaceModules hook)

// enabledModules: space-level overrides. When empty/absent, inherits from workflow defaults.
// See use-space-modules.ts for the resolution chain: space → workflow → org
export const MOCK_SPACES = [
  { id: "loc-main", name: "Main Office", enabledModules: [] as string[], _count: { tasks: 6 } },      // inherits Office workflow defaults
  { id: "loc-warehouse", name: "Warehouse", enabledModules: [] as string[], _count: { tasks: 5 } },    // inherits Logistics workflow defaults
  { id: "loc-service", name: "Service Center", enabledModules: [] as string[], _count: { tasks: 4 } }, // inherits Field Service workflow defaults
  { id: "loc-remote", name: "Remote Team", enabledModules: [] as string[], _count: { tasks: 4 } },     // inherits Software workflow defaults
  { id: "loc-factory", name: "Factory Floor", enabledModules: [] as string[], _count: { tasks: 3 } },  // inherits Simple workflow defaults
]

// ─── Mock Sprints (only for spaces with sprints enabled) ─────────────────────

export const MOCK_SPRINTS: Sprint[] = [
  { id: "sprint-0", name: "Sprint 0", goal: "Initial setup", organizationId: "org1", startDate: new Date(Date.now() - 28 * 86400000).toISOString(), endDate: new Date(Date.now() - 14 * 86400000).toISOString(), status: "COMPLETED", position: 0, createdAt: new Date(Date.now() - 35 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 14 * 86400000).toISOString() },
  { id: "sprint-1", name: "Sprint 1", goal: "Priority maintenance & development", organizationId: "org1", startDate: new Date(Date.now() - 7 * 86400000).toISOString(), endDate: new Date(Date.now() + 7 * 86400000).toISOString(), status: "ACTIVE", position: 1, createdAt: new Date(Date.now() - 14 * 86400000).toISOString(), updatedAt: new Date().toISOString() },
  { id: "sprint-2", name: "Sprint 2", goal: "Installations & upgrades", organizationId: "org1", startDate: new Date(Date.now() + 8 * 86400000).toISOString(), endDate: new Date(Date.now() + 21 * 86400000).toISOString(), status: "PLANNING", position: 2, createdAt: new Date(Date.now() - 14 * 86400000).toISOString(), updatedAt: new Date().toISOString() },
]

// ─── Mock Epics (only for spaces with epics enabled) ─────────────────────────

export const MOCK_EPICS: Epic[] = [
  { id: "epic-1", name: "Infrastructure Upgrade", description: "Upgrade all building systems", color: "#8B5CF6", status: "IN_PROGRESS", organizationId: "org1", startDate: new Date(Date.now() - 30 * 86400000).toISOString(), targetDate: new Date(Date.now() + 60 * 86400000).toISOString(), position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), _count: { tasks: 4 } },
  { id: "epic-2", name: "Safety Compliance", description: "Meet all safety certifications", color: "#DC2626", status: "IN_PROGRESS", organizationId: "org1", startDate: null, targetDate: new Date(Date.now() + 30 * 86400000).toISOString(), position: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), _count: { tasks: 3 } },
  { id: "epic-3", name: "App v2.0", description: "Major platform redesign", color: "#2563EB", status: "IN_PROGRESS", organizationId: "org1", startDate: new Date(Date.now() - 14 * 86400000).toISOString(), targetDate: new Date(Date.now() + 45 * 86400000).toISOString(), position: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), _count: { tasks: 3 } },
]

// ─── Mock Phases ─────────────────────────────────────────────────────────────

export const MOCK_PHASES: Phase[] = [
  { id: "phase-1", name: "Planning", description: null, color: "#3B82F6", type: "phase", organizationId: "org1", startDate: null, endDate: null, position: 0, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "phase-2", name: "Execution", description: null, color: "#F59E0B", type: "phase", organizationId: "org1", startDate: null, endDate: null, position: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "phase-3", name: "Review", description: null, color: "#10B981", type: "phase", organizationId: "org1", startDate: null, endDate: null, position: 2, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]

export const MOCK_VELOCITY: { sprintName: string; velocity: number }[] = [
  { sprintName: "Sprint -4", velocity: 18 },
  { sprintName: "Sprint -3", velocity: 21 },
  { sprintName: "Sprint -2", velocity: 24 },
  { sprintName: "Sprint -1", velocity: 22 },
  { sprintName: "Sprint 0", velocity: 26 },
]

export const MOCK_STATUS_COUNTS: Record<string, number> = {
  NEW: 4, ASSIGNED: 3, ACCEPTED: 1, EN_ROUTE: 1, ARRIVED: 1,
  IN_PROGRESS: 4, BLOCKED: 2, COMPLETED: 4, CANCELED: 1, CLOSED: 1,
}

// ─── Mock Tasks — distributed across spaces with realistic data ──────────────

export function createMockTasks(): Task[] {
  const base = { locationLat: null, locationLng: null, routeStartedAt: null, routeEndedAt: null, routeDistance: null, organizationId: "org1", createdById: "u1", createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date().toISOString(), createdBy: { id: "u1", firstName: "John", lastName: "Owner", email: "john@example.com" } }

  return [
    // ═══ MAIN OFFICE — Office work, has sprints + story points ═══════════════
    { ...base, id: "t1", title: "HVAC System Maintenance", description: "Annual HVAC inspection and filter replacement for all floors", status: "IN_PROGRESS", priority: "HIGH", dueDate: d(1), startDate: d(-1), estimatedHours: 6, locationAddress: "Main Office", assignedToId: "w2", sprintId: "sprint-1", storyPoints: 8, epicId: "epic-1", spaceId: "loc-main", space: { id: "loc-main", name: "Main Office" }, position: 0, _count: { subtasks: 2 }, assignedTo: u("w2", "Rami", "H."), assignees: [a("a1", "w2", "Rami", "H.", "LEAD"), a("a2", "w5", "Fatima", "S.", "MEMBER")], checklistItems: [cl("c1", "Inspect filters", true), cl("c2", "Replace worn filters", true), cl("c3", "Test airflow", false), cl("c4", "Update maintenance log", false)] },
    { ...base, id: "t2", title: "Office Furniture Assembly", description: "Assemble 8 new desks for the expansion area", status: "ASSIGNED", priority: "MEDIUM", dueDate: d(5), startDate: d(2), estimatedHours: 4, locationAddress: "Main Office", assignedToId: "w4", sprintId: "sprint-1", storyPoints: 3, spaceId: "loc-main", space: { id: "loc-main", name: "Main Office" }, position: 0, assignedTo: u("w4", "Lisa", "A."), assignees: [a("a3", "w4", "Lisa", "A.", "LEAD")], checklistItems: [] },
    { ...base, id: "t3", title: "Parking Lot Repaint", description: "Repaint parking lines and handicap spots", status: "COMPLETED", priority: "LOW", dueDate: d(-3), startDate: d(-7), estimatedHours: 10, locationAddress: "Main Office", assignedToId: "w11", storyPoints: 2, spaceId: "loc-main", space: { id: "loc-main", name: "Main Office" }, position: 0, assignedTo: u("w11", "Hassan", "B."), assignees: [a("a4", "w11", "Hassan", "B.", "LEAD")], checklistItems: [cl("c5", "Mark area", true), cl("c6", "Apply paint", true), cl("c7", "Dry and inspect", true)] },
    { ...base, id: "t4", title: "Conference Room AV Setup", description: "Install projector and video conferencing equipment", status: "NEW", priority: "MEDIUM", dueDate: d(10), startDate: null, estimatedHours: 3, locationAddress: "Main Office", assignedToId: null, sprintId: "sprint-2", storyPoints: 5, epicId: "epic-1", spaceId: "loc-main", space: { id: "loc-main", name: "Main Office" }, position: 0, assignedTo: null, assignees: [], checklistItems: [] },
    { ...base, id: "t5", title: "Window Tinting", description: "Apply UV tint to south-facing windows", status: "ASSIGNED", priority: "LOW", dueDate: d(14), startDate: d(7), estimatedHours: null, locationAddress: "Main Office", assignedToId: "w18", storyPoints: 1, spaceId: "loc-main", space: { id: "loc-main", name: "Main Office" }, position: 1, assignedTo: u("w18", "Tom", "M."), assignees: [a("a5", "w18", "Tom", "M.", "LEAD")], checklistItems: [] },
    { ...base, id: "t6", title: "IT Server Room Cleanup", description: "Organize cables, label ports, update rack diagram", status: "ACCEPTED", priority: "LOW", dueDate: d(7), startDate: null, estimatedHours: 2, locationAddress: "Main Office", assignedToId: "w4", sprintId: "sprint-1", storyPoints: 1, spaceId: "loc-main", space: { id: "loc-main", name: "Main Office" }, position: 0, assignedTo: u("w4", "Lisa", "A."), assignees: [a("a6", "w4", "Lisa", "A.", "LEAD")], checklistItems: [] },

    // ═══ WAREHOUSE — Logistics work, NO sprints, NO story points ═════════════
    { ...base, id: "t7", title: "Inventory Audit — Section B", description: "Count and verify all items in warehouse section B", status: "IN_PROGRESS", priority: "HIGH", dueDate: d(2), startDate: d(-1), estimatedHours: 8, locationAddress: "Warehouse", assignedToId: "w9", spaceId: "loc-warehouse", space: { id: "loc-warehouse", name: "Warehouse" }, position: 1, assignedTo: u("w9", "Yusuf", "R."), assignees: [a("a7", "w9", "Yusuf", "R.", "LEAD"), a("a8", "w12", "Dana", "P.", "MEMBER")], checklistItems: [cl("c8", "Scan aisle B1-B5", true), cl("c9", "Scan aisle B6-B10", true), cl("c10", "Reconcile with system", false), cl("c11", "Report discrepancies", false)] },
    { ...base, id: "t8", title: "Forklift Maintenance", description: "Service forklift #3 — oil change, brake check", status: "ASSIGNED", priority: "URGENT", dueDate: d(1), startDate: d(0), estimatedHours: 3, locationAddress: "Warehouse", assignedToId: "w11", spaceId: "loc-warehouse", space: { id: "loc-warehouse", name: "Warehouse" }, position: 2, assignedTo: u("w11", "Hassan", "B."), assignees: [a("a9", "w11", "Hassan", "B.", "LEAD")], checklistItems: [cl("c12", "Oil change", false), cl("c13", "Brake inspection", false), cl("c14", "Hydraulic fluid", false)] },
    { ...base, id: "t9", title: "Roof Leak Repair", description: "Patch roof leak above storage room", status: "NEW", priority: "HIGH", dueDate: d(1), startDate: null, estimatedHours: 4, locationAddress: "Warehouse", assignedToId: null, spaceId: "loc-warehouse", space: { id: "loc-warehouse", name: "Warehouse" }, position: 1, assignedTo: null, assignees: [], checklistItems: [] },
    { ...base, id: "t10", title: "Pallet Rack Inspection", description: "Annual safety inspection of all pallet racks", status: "COMPLETED", priority: "MEDIUM", dueDate: d(-5), startDate: d(-7), estimatedHours: 6, locationAddress: "Warehouse", assignedToId: "w9", spaceId: "loc-warehouse", space: { id: "loc-warehouse", name: "Warehouse" }, position: 1, assignedTo: u("w9", "Yusuf", "R."), assignees: [a("a10", "w9", "Yusuf", "R.", "LEAD")], checklistItems: [cl("c15", "Visual check", true), cl("c16", "Load test", true), cl("c17", "Document findings", true)] },
    { ...base, id: "t11", title: "Loading Dock Light Replacement", description: "Replace 4 broken lights at dock B", status: "BLOCKED", priority: "MEDIUM", dueDate: d(-2), startDate: null, estimatedHours: 2, locationAddress: "Warehouse", assignedToId: "w12", spaceId: "loc-warehouse", space: { id: "loc-warehouse", name: "Warehouse" }, position: 0, assignedTo: u("w12", "Dana", "P."), assignees: [a("a11", "w12", "Dana", "P.", "LEAD")], checklistItems: [] },

    // ═══ SERVICE CENTER — Full Agile, sprints + points + epics + custom fields ═
    { ...base, id: "t12", title: "Electrical Panel Inspection", description: "Quarterly safety inspection of main panel", status: "EN_ROUTE", priority: "URGENT", dueDate: d(2), startDate: d(0), estimatedHours: 3, locationAddress: "Service Center", assignedToId: "w5", sprintId: "sprint-1", storyPoints: 5, epicId: "epic-2", spaceId: "loc-service", space: { id: "loc-service", name: "Service Center" }, position: 0, assignedTo: u("w5", "Fatima", "S."), assignees: [a("a12", "w5", "Fatima", "S.", "LEAD")], checklistItems: [cl("c18", "Visual inspection", false), cl("c19", "Thermal scan", false), cl("c20", "Test breakers", false)] },
    { ...base, id: "t13", title: "Generator Backup Test", description: "Monthly generator test run and documentation", status: "COMPLETED", priority: "MEDIUM", dueDate: d(-1), startDate: d(-2), estimatedHours: 1.5, locationAddress: "Service Center", assignedToId: "w15", storyPoints: 2, spaceId: "loc-service", space: { id: "loc-service", name: "Service Center" }, position: 2, assignedTo: u("w15", "David", "K."), assignees: [a("a13", "w15", "David", "K.", "LEAD")], checklistItems: [cl("c21", "Start generator", true), cl("c22", "Run 30 min", true), cl("c23", "Check voltage", true)] },
    { ...base, id: "t14", title: "Fire Alarm Certification", description: "Annual fire alarm testing for certification", status: "BLOCKED", priority: "URGENT", dueDate: d(-1), startDate: null, estimatedHours: 8, locationAddress: "Service Center", assignedToId: "w3", sprintId: "sprint-1", storyPoints: 13, epicId: "epic-2", spaceId: "loc-service", space: { id: "loc-service", name: "Service Center" }, position: 1, assignedTo: u("w3", "Karim", "A."), assignees: [a("a14", "w3", "Karim", "A.", "LEAD")], checklistItems: [] },
    { ...base, id: "t15", title: "Security Camera Installation", description: "Install 4 new cameras in parking area", status: "IN_PROGRESS", priority: "HIGH", dueDate: d(5), startDate: d(0), estimatedHours: 5, locationAddress: "Service Center", assignedToId: "w5", sprintId: "sprint-1", storyPoints: 5, epicId: "epic-1", spaceId: "loc-service", space: { id: "loc-service", name: "Service Center" }, position: 2, assignedTo: u("w5", "Fatima", "S."), assignees: [a("a15", "w5", "Fatima", "S.", "LEAD"), a("a16", "w2", "Rami", "H.", "MEMBER")], checklistItems: [cl("c24", "Mount brackets", true), cl("c25", "Run cables", false), cl("c26", "Connect NVR", false), cl("c27", "Configure", false), cl("c28", "Test night vision", false)] },

    // ═══ REMOTE TEAM — Software work, sprints + points + epics + phases ═══════
    { ...base, id: "t16", title: "Design new dashboard layout", description: "Create wireframes and mockups for the v2 dashboard", status: "IN_PROGRESS", priority: "HIGH", dueDate: d(5), startDate: d(-3), estimatedHours: 16, locationAddress: null, assignedToId: "w20", sprintId: "sprint-1", storyPoints: 8, epicId: "epic-3", phaseId: "phase-2", spaceId: "loc-remote", space: { id: "loc-remote", name: "Remote Team" }, position: 3, assignedTo: u("w20", "Sara", "D."), assignees: [a("a17", "w20", "Sara", "D.", "LEAD")], checklistItems: [cl("c29", "Wireframes", true), cl("c30", "High-fi mockups", true), cl("c31", "Prototype", false), cl("c32", "Review with team", false)] },
    { ...base, id: "t17", title: "API v2 endpoints", description: "Build new REST endpoints for the mobile app v2", status: "IN_PROGRESS", priority: "HIGH", dueDate: d(7), startDate: d(-2), estimatedHours: 24, locationAddress: null, assignedToId: "w21", sprintId: "sprint-1", storyPoints: 13, epicId: "epic-3", phaseId: "phase-2", spaceId: "loc-remote", space: { id: "loc-remote", name: "Remote Team" }, position: 4, assignedTo: u("w21", "Omar", "K."), assignees: [a("a18", "w21", "Omar", "K.", "LEAD"), a("a19", "w22", "Noor", "S.", "MEMBER")], checklistItems: [cl("c33", "Auth endpoints", true), cl("c34", "Task endpoints", true), cl("c35", "Attendance endpoints", false), cl("c36", "Tests", false), cl("c37", "Documentation", false)] },
    { ...base, id: "t18", title: "Write unit tests for auth module", description: "Cover login, register, refresh, and password reset flows", status: "NEW", priority: "MEDIUM", dueDate: d(10), startDate: null, estimatedHours: 8, locationAddress: null, assignedToId: "w22", sprintId: "sprint-2", storyPoints: 5, epicId: "epic-3", phaseId: "phase-1", spaceId: "loc-remote", space: { id: "loc-remote", name: "Remote Team" }, position: 2, assignedTo: u("w22", "Noor", "S."), assignees: [a("a20", "w22", "Noor", "S.", "LEAD")], checklistItems: [] },
    { ...base, id: "t19", title: "Fix mobile app crash on login", description: "App crashes when password field has special chars", status: "COMPLETED", priority: "URGENT", dueDate: d(-2), startDate: d(-3), estimatedHours: 2, locationAddress: null, assignedToId: "w21", storyPoints: 2, epicId: "epic-3", phaseId: "phase-3", spaceId: "loc-remote", space: { id: "loc-remote", name: "Remote Team" }, position: 3, assignedTo: u("w21", "Omar", "K."), assignees: [a("a21", "w21", "Omar", "K.", "LEAD")], checklistItems: [cl("c38", "Reproduce", true), cl("c39", "Fix", true), cl("c40", "Test", true)] },

    // ═══ FACTORY FLOOR — Simple work, time tracking only ══════════════════════
    { ...base, id: "t20", title: "Boiler Annual Service", description: "Full boiler maintenance and safety check", status: "ARRIVED", priority: "HIGH", dueDate: d(1), startDate: d(0), estimatedHours: 6, locationAddress: "Factory Floor", assignedToId: "w15", spaceId: "loc-factory", space: { id: "loc-factory", name: "Factory Floor" }, position: 0, assignedTo: u("w15", "David", "K."), assignees: [a("a22", "w15", "David", "K.", "LEAD")], checklistItems: [cl("c41", "Drain", true), cl("c42", "Clean exchanger", false), cl("c43", "Pressure test", false), cl("c44", "Certify", false)] },
    { ...base, id: "t21", title: "Assembly Line Lubrication", description: "Lubricate all moving parts on line 2", status: "NEW", priority: "MEDIUM", dueDate: d(3), startDate: null, estimatedHours: 2, locationAddress: "Factory Floor", assignedToId: null, spaceId: "loc-factory", space: { id: "loc-factory", name: "Factory Floor" }, position: 3, assignedTo: null, assignees: [], checklistItems: [] },
    { ...base, id: "t22", title: "Replace Conveyor Belt Section", description: "Worn section on conveyor #4 needs replacement", status: "CANCELED", priority: "LOW", dueDate: null, startDate: null, estimatedHours: null, locationAddress: "Factory Floor", assignedToId: null, spaceId: "loc-factory", space: { id: "loc-factory", name: "Factory Floor" }, position: 0, assignedTo: null, assignees: [], checklistItems: [] },
  ]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function d(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString()
}

function u(id: string, first: string, last: string) {
  return { id, firstName: first, lastName: last, email: `${first.toLowerCase()}@example.com` }
}

function a(id: string, userId: string, first: string, last: string, role: "LEAD" | "MEMBER") {
  return { id, userId, role, user: { id: userId, firstName: first, lastName: last }, createdAt: new Date().toISOString() }
}

function cl(id: string, text: string, done: boolean) {
  return { id, text, isCompleted: done, position: 0, createdAt: new Date().toISOString() }
}
