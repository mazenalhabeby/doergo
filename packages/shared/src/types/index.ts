// Re-export all enums from dedicated file (avoids require cycles with sub-modules)
export {
  Role, Platform, AccessLevel, TaskStatus, TaskPriority, TaskEventType,
  AttachmentType, AssetStatus, ReportAttachmentType, TaskAssigneeRole,
  ContractType, OvertimePolicy, OvertimeDetectionSource,
  TimeEntryStatus, BreakType, ApprovalStatus, WORKER_ROLE,
  DependencyType, SprintStatus, EpicStatus,
  CustomFieldType, RecurrenceFrequency,
  TaskCreationScope, TimeOffStatus, InvoiceStatus,
} from './enums';

export {
  getDefaultModules, hasModule, hasAccessModule, getModuleLabel, getModules,
  getSpaceScope, getAccessPlatforms, canContactColleagues, getWebScreens,
  getFeatureModules, hasFeatureModule, DEFAULT_ORG_MODULES,
  type MobileModule, type AccessProfile, type SpaceScope, type AccessPlatform, type WebScreen,
  DEFAULT_MODULES, ALL_MODULES,
} from './modules';
export * from './schedule';
export * from './task-flow';

import {
  Role, AccessLevel, TaskStatus, TaskPriority,
  AttachmentType, AssetStatus, ReportAttachmentType, TaskEventType,
  DependencyType, SprintStatus, CustomFieldType, RecurrenceFrequency,
  TaskCreationScope,
} from './enums';

// Legacy role aliases → the two surviving roles (managers are now flagged employees).
export const LegacyRoleMap = {
  PARTNER: Role.ADMIN,
  OFFICE: Role.EMPLOYEE,
  WORKER: Role.EMPLOYEE,
  CLIENT: Role.ADMIN,
  DISPATCHER: Role.EMPLOYEE,
  TECHNICIAN: Role.EMPLOYEE,
} as const;

// Normalize any (incl. legacy) role string to one of the two surviving roles.
// ADMIN/CLIENT/PARTNER → ADMIN; everything else (EMPLOYEE + legacy
// MANAGER/OFFICE/DISPATCHER/TECHNICIAN/WORKER) → EMPLOYEE.
export function normalizeRole(role: string): Role {
  if (role === 'ADMIN' || role === 'CLIENT' || role === 'PARTNER') return Role.ADMIN;
  // External customers are a distinct principal — never collapse to a staff role.
  if (role === 'CUSTOMER') return Role.CUSTOMER;
  return Role.EMPLOYEE;
}

// Get display label for a role
export function getRoleLabel(role: string): string {
  const r = normalizeRole(role);
  if (r === Role.ADMIN) return 'Admin';
  if (r === Role.CUSTOMER) return 'Customer';
  return 'Employee';
}

// Socket.IO Events
export const SocketEvents = {
  // Task events
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_DECLINED: 'task.declined',
  TASK_STATUS_CHANGED: 'task.statusChanged',
  TASK_COMMENT_ADDED: 'task.commentAdded',
  TASK_ATTACHMENT_ADDED: 'task.attachmentAdded',
  TASK_DELETED: 'task.deleted',
  // Worker events
  WORKER_LOCATION_UPDATED: 'worker.locationUpdated',
  // Attendance events
  CLOCK_IN: 'attendance.clockIn',
  CLOCK_OUT: 'attendance.clockOut',
  // Break events
  BREAK_STARTED: 'break.started',
  BREAK_ENDED: 'break.ended',
  // Availability status (Available/Busy/Away) changed
  PRESENCE_CHANGED: 'presence.changed',
  // Support events
  SUPPORT_MESSAGE: 'support.message', // new message on a ticket
  SUPPORT_TICKET_UPDATED: 'support.ticketUpdated', // status/assignment/SLA change
  SUPPORT_TYPING: 'support.typing', // live-chat typing indicator
  SUPPORT_AGENT_PRESENCE: 'support.agentPresence', // is a human agent online
  // Chat (member-to-member) events
  CHAT_MESSAGE: 'chat.message', // new message in a conversation
  CHAT_CONVERSATION_UPDATED: 'chat.conversationUpdated', // last message / read / membership
  CHAT_TYPING: 'chat.typing', // typing indicator in a conversation
} as const;

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

// Pagination params
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Base entity interface
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// User interface
export interface User extends BaseEntity {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  organizationId: string | null;
  isActive: boolean;
  onboardingCompleted: boolean;
  // Permission fields
  canCreateTasks: boolean;
  taskCreationScope?: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Technician-specific fields
}

// Default permissions by role
export const DEFAULT_PERMISSIONS: Record<Role, {
  canCreateTasks: boolean;
  taskCreationScope: TaskCreationScope;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
}> = {
  [Role.ADMIN]: {
    canCreateTasks: true,
    taskCreationScope: TaskCreationScope.ORG,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
  },
  [Role.EMPLOYEE]: {
    canCreateTasks: false,
    taskCreationScope: TaskCreationScope.SELF,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  },
  // External customer: zero staff permissions. Request submission is authorized
  // by CustomerScopeGuard + dedicated portal endpoints, NOT by these flags.
  [Role.CUSTOMER]: {
    canCreateTasks: false,
    taskCreationScope: TaskCreationScope.NONE,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  },
};

// Profile badge visibility configuration
export interface ProfileBadgesConfig {
  showRole: boolean;
  showType: boolean;
  showSpecialty: boolean;
}

export const DEFAULT_PROFILE_BADGES: ProfileBadgesConfig = {
  showRole: true,
  showType: true,
  showSpecialty: true,
};

// ==================== ORGANIZATION MODULES ====================

/** Available optional modules that admins can enable per organization or space */
export const AVAILABLE_MODULES = [
  // Task sections
  { key: 'subtasks', label: 'Subtasks', description: 'Break tasks into smaller child tasks', group: 'task' },
  { key: 'checklists', label: 'Checklists', description: 'Add step-by-step checklists to tasks', group: 'task' },
  { key: 'attachments', label: 'Attachments', description: 'Upload files and images to tasks', group: 'task' },
  { key: 'dependencies', label: 'Dependencies', description: 'Define task sequencing and blockers', group: 'task' },
  { key: 'custom_fields', label: 'Custom Fields', description: 'Add custom data fields to tasks', group: 'task' },
  // Field service
  { key: 'tracking', label: 'Route Tracking', description: 'GPS tracking, route visualization, and progress card', group: 'field' },
  { key: 'service_reports', label: 'Service Reports', description: 'Completion reports with photos and signatures', group: 'field' },
  { key: 'time_tracking', label: 'Time Tracking', description: 'Track estimated and actual hours', group: 'field' },
  // Agile
  { key: 'sprints', label: 'Sprints', description: 'Organize work into time-boxed iterations', group: 'agile' },
  { key: 'story_points', label: 'Story Points', description: 'Estimate task complexity with fibonacci points', group: 'agile' },
  { key: 'epics', label: 'Epics', description: 'Group related tasks into larger projects', group: 'agile' },
  { key: 'phases', label: 'Phases', description: 'Organize tasks into project phases', group: 'agile' },
] as const;

/** Display groups for the module catalog. */
export const MODULE_GROUPS = [
  { key: 'task', label: 'Task sections', description: 'Extra detail inside a task' },
  { key: 'field', label: 'Field service', description: 'On-site / mobile work' },
  { key: 'agile', label: 'Project / Agile', description: 'Project-style planning' },
] as const;

/** One-click module bundles by business type. */
export const MODULE_PRESETS: { key: string; label: string; modules: string[] }[] = [
  { key: 'field_service', label: 'Field Service', modules: ['subtasks', 'checklists', 'attachments', 'tracking', 'service_reports', 'time_tracking'] },
  { key: 'logistics', label: 'Logistics', modules: ['subtasks', 'checklists', 'attachments', 'tracking', 'time_tracking'] },
  { key: 'project', label: 'Project / Agile', modules: ['subtasks', 'checklists', 'attachments', 'dependencies', 'custom_fields', 'time_tracking', 'sprints', 'story_points', 'epics', 'phases'] },
  { key: 'minimal', label: 'Minimal', modules: ['checklists', 'attachments'] },
  { key: 'everything', label: 'Everything', modules: ['subtasks', 'checklists', 'attachments', 'dependencies', 'custom_fields', 'tracking', 'service_reports', 'time_tracking', 'sprints', 'story_points', 'epics', 'phases'] },
];

/** Union type of all available module keys */
export type ModuleKey = typeof AVAILABLE_MODULES[number]['key'];

// Organization interface
export interface Organization extends BaseEntity {
  name: string;
  isActive: boolean;
  enabledModules?: ModuleKey[] | null;
}

// CompanyLocation, Break, TimeEntry, AttendanceStatus
// are defined in ./attendance.ts and re-exported below via `export * from './attendance'`

// Employee Assignment interface (many-to-many: User ↔ CompanyLocation)
export interface EmployeeAssignment extends BaseEntity {
  userId: string;
  locationId: string;
  isPrimary: boolean;
  schedule: string[];
  effectiveFrom: Date;
  effectiveTo?: Date;
  location?: {
    id: string;
    name: string;
    address?: string;
    lat: number;
    lng: number;
    geofenceRadius: number;
  };
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

/** @deprecated Use EmployeeAssignment */
export type TechnicianAssignment = EmployeeAssignment;

// Organization Access (delegation between orgs)
export interface OrganizationAccess extends BaseEntity {
  grantorOrgId: string;    // The org granting access
  granteeOrgId: string;    // The org receiving access
  accessLevel: AccessLevel;
  canViewTasks: boolean;
  canAssignWorkers: boolean;
  canViewWorkers: boolean;
  canViewTracking: boolean;
}

// Task Assignee interface (many-to-many: Task ↔ User)
export interface TaskAssignee {
  id: string;
  taskId: string;
  userId: string;
  role: import('./enums').TaskAssigneeRole;
  createdAt: Date;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
}

// Checklist Item interface
export interface ChecklistItem {
  id: string;
  taskId: string;
  text: string;
  isCompleted: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

// Task interface
export interface Task extends BaseEntity {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  organizationId: string;
  createdById: string;
  assignedToId?: string;
  assetId?: string;
  dueDate?: Date;
  startDate?: Date;
  estimatedHours?: number;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  // Subtask hierarchy
  parentId?: string;
  depth?: number;
  position?: number;
  // Agile fields
  storyPoints?: number;
  // Phase, Sprint & Epic associations
  phaseId?: string;
  sprintId?: string;
  epicId?: string;
  // Space (CompanyLocation) association
  spaceId?: string | null;
  space?: { id: string; name: string } | null;
  // Populated relations
  asset?: Asset;
  assignees?: TaskAssignee[];
  checklistItems?: ChecklistItem[];
  subtasks?: Task[];
  parent?: { id: string; title: string };
  phase?: Phase;
  sprint?: Sprint;
  epic?: Epic;
  predecessors?: TaskDependencyWithTask[];
  successors?: TaskDependencyWithTask[];
  _count?: { subtasks?: number };
}

// Phase interface (project phase or milestone)
export interface Phase extends BaseEntity {
  name: string;
  description?: string;
  color: string;
  type: string; // "phase" or "milestone"
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
  position: number;
  isActive: boolean;
  _count?: { tasks?: number };
}

// Sprint interface (agile sprint)
export interface Sprint extends BaseEntity {
  name: string;
  goal?: string;
  organizationId: string;
  startDate: Date;
  endDate: Date;
  status: SprintStatus;
  position: number;
  tasks?: Task[];
  _count?: { tasks?: number };
}

// Epic interface (agile epic for grouping tasks)
export interface Epic extends BaseEntity {
  name: string;
  description?: string;
  color: string;
  status: string;
  organizationId: string;
  startDate?: Date;
  targetDate?: Date;
  position: number;
  tasks?: Task[];
  _count?: { tasks?: number };
}

// Sprint Report interface (generated when sprint completes)
export interface SprintReport {
  id: string;
  sprintId: string;
  organizationId: string;
  committedPoints: number;
  completedPoints: number;
  committedTasks: number;
  completedTasks: number;
  carriedOverTasks: number;
  carriedOverPoints: number;
  addedMidSprint: number;
  removedMidSprint: number;
  velocity: number;
  dailyBurndown: { date: string; remaining: number; ideal: number }[];
  createdAt: string;
}

// Definition of Done interface
export interface DefinitionOfDone {
  id: string;
  organizationId: string;
  workflowId: string | null;
  items: { text: string; isRequired: boolean }[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Velocity data point for charts
export interface VelocityDataPoint {
  sprintName: string;
  committedPoints: number;
  completedPoints: number;
  velocity: number;
}

/** Fibonacci story point options */
export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;

/** Schedule type options for members */
export const SCHEDULE_TYPES = [
  { key: 'NONE', label: 'No tracking', description: 'Time is not tracked' },
  { key: 'FIXED', label: 'Fixed schedule', description: 'Set working hours (e.g., Mon-Fri 9:00-17:00)' },
  { key: 'FLEXIBLE', label: 'Flexible hours', description: 'Monthly hour budget (e.g., 160h/month)' },
] as const;

/** Common position/title suggestions */
export const POSITION_SUGGESTIONS = [
  'Technician', 'Driver', 'Accountant', 'HR Manager', 'Sales Representative',
  'Office Manager', 'Warehouse Worker', 'Service Engineer', 'Project Manager',
  'Designer', 'Developer', 'Customer Support', 'Delivery Driver', 'Inspector',
] as const;

// Task Dependency interface
export interface TaskDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
  createdAt: Date;
}

// Task Dependency with populated task info
export interface TaskDependencyWithTask extends TaskDependency {
  predecessor?: { id: string; title: string; status: TaskStatus };
  successor?: { id: string; title: string; status: TaskStatus };
}

// Comment interface
export interface Comment extends BaseEntity {
  taskId: string;
  userId: string;
  content: string;
}

// Attachment interface
export interface Attachment extends BaseEntity {
  taskId: string;
  uploadedById: string;
  fileName: string;
  fileUrl: string;
  fileType: AttachmentType;
  fileSize: number;
}

// Task Event interface (for activity timeline)
export interface TaskEvent extends BaseEntity {
  taskId: string;
  userId: string;
  eventType: TaskEventType;
  metadata?: Record<string, unknown>;
}

// Worker Location interface
export interface WorkerLocation {
  userId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: Date;
}

// Asset Category interface (organization-defined)
export interface AssetCategory extends BaseEntity {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  organizationId: string;
}

// Asset Type interface (within a category)
export interface AssetType extends BaseEntity {
  name: string;
  description?: string;
  categoryId: string;
}

// Asset interface (the actual equipment)
export interface Asset extends BaseEntity {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  status: AssetStatus;
  installDate?: Date;
  warrantyExpiry?: Date;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  organizationId: string;
  categoryId?: string;
  typeId?: string;
  // Populated relations
  category?: AssetCategory;
  type?: AssetType;
}

// Asset with maintenance history (using ServiceReports)
export interface AssetWithHistory extends Asset {
  serviceReports: ServiceReportSummary[];
}

// Service Report Summary (for asset maintenance history list)
export interface ServiceReportSummary {
  id: string;
  taskId: string;
  taskTitle: string;
  summary: string;
  workDuration: number; // in seconds
  completedAt: Date;
  completedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  partsTotal?: number; // Total cost of parts used
  attachmentCount: number;
  hasBeforePhotos: boolean;
  hasAfterPhotos: boolean;
}

// Service Report interface (full report)
export interface ServiceReport extends BaseEntity {
  taskId: string;
  assetId?: string;
  summary: string;
  workPerformed?: string;
  workDuration: number; // in seconds
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  completedAt: Date;
  completedById: string;
  organizationId: string;
  // Populated relations
  completedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  attachments?: ReportAttachment[];
  partsUsed?: PartUsed[];
}

// Report Attachment interface
export interface ReportAttachment extends BaseEntity {
  reportId: string;
  type: ReportAttachmentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  caption?: string;
}

// Part Used interface
export interface PartUsed extends BaseEntity {
  reportId: string;
  name: string;
  partNumber?: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

// Complete Task DTO (for creating report when completing task)
export interface CompleteTaskInput {
  summary: string;
  workPerformed?: string;
  workDuration: number;
  technicianSignature?: string;
  customerSignature?: string;
  customerName?: string;
  partsUsed?: {
    name: string;
    partNumber?: string;
    quantity: number;
    unitCost?: number;
    notes?: string;
  }[];
}

// ==================== CUSTOM WORKFLOWS ====================

// Status Workflow interface
export interface StatusWorkflow extends BaseEntity {
  organizationId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  statuses?: WorkflowStatus[];
  _count?: { tasks?: number };
}

// Workflow Status interface (individual status within a workflow)
export interface WorkflowStatus {
  id: string;
  workflowId: string;
  name: string;
  key: string;
  color: string;
  icon?: string;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  createdAt: Date;
}

// ==================== CUSTOM FIELDS ====================

// Custom Field Definition interface
export interface CustomFieldDefinition extends BaseEntity {
  organizationId: string;
  name: string;
  key: string;
  type: CustomFieldType;
  options?: unknown; // JSON: string[] for DROPDOWN
  isRequired: boolean;
  position: number;
  isActive: boolean;
}

// Custom Field Value interface
export interface CustomFieldValue {
  id: string;
  definitionId: string;
  taskId: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
  definition?: CustomFieldDefinition;
}

// ==================== RECURRING TASKS ====================

// Recurring Task Template interface
export interface RecurringTaskTemplate extends BaseEntity {
  organizationId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assigneeIds?: string[];
  estimatedHours?: number;
  checklist?: { text: string }[];
  frequency: RecurrenceFrequency;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: Date;
  endDate?: Date;
  lastGeneratedAt?: Date;
  nextRunAt?: Date;
  isActive: boolean;
  createdById: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

// ==================== CUSTOM ROLES & PERMISSIONS ====================

// Only the permissions that are actually ENFORCED server-side (mapped to User
// columns and checked by the permissions guard) live here, so every toggle in
// the UI is real. Reach/scope (platform, space visibility, collaboration) and
// feature tabs are NOT permissions — they live on the per-user Access Profile.
export const PERMISSION_SCHEMA = [
  { group: 'Tasks', permissions: [
    { key: 'canCreateTasks', label: 'Create tasks', description: 'Can create new tasks' },
    { key: 'canViewAllTasks', label: 'View all tasks', description: 'Can see all tasks in the organization' },
    { key: 'canAssignTasks', label: 'Assign tasks', description: 'Can assign tasks to team members' },
  ]},
  { group: 'Team', permissions: [
    { key: 'canManageUsers', label: 'Manage members', description: 'Can add, edit, and remove team members' },
  ]},
] as const;

export type PermissionKey = typeof PERMISSION_SCHEMA[number]['permissions'][number]['key'];

export interface OrgRoleData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  legacyRole: string | null;
  position: number;
  isActive: boolean;
  permissions: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number };
}

// Export attendance types
export * from './attendance';

// Export employee types (file still named technician.ts for git history)
export * from './technician';

// Export invitation types
export * from './invitation';

// Export onboarding types
export * from './onboarding';
