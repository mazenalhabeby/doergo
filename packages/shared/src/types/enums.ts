// Shared enums — extracted to avoid require cycles between index.ts and sub-modules

export enum Role {
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  // External end-customer (customer portal). NOT a staff role — a CUSTOMER only
  // ever sees their own requests via the portal. normalizeRole() preserves it.
  CUSTOMER = 'CUSTOMER',
  // Note: legacy roles (CLIENT/DISPATCHER/TECHNICIAN) and MANAGER have been
  // retired. normalizeRole() still collapses any legacy string → ADMIN/EMPLOYEE.
}

export const WORKER_ROLE = 'WORKER' as const;

export enum Platform {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  BOTH = 'BOTH',
}

export enum AccessLevel {
  NONE = 'NONE',
  TASKS_ONLY = 'TASKS_ONLY',
  TASKS_ASSIGN = 'TASKS_ASSIGN',
  FULL = 'FULL',
}

export enum TaskStatus {
  DRAFT = 'DRAFT',
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',
  EN_ROUTE = 'EN_ROUTE',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
  CLOSED = 'CLOSED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TaskEventType {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  ASSIGNED = 'ASSIGNED',
  UNASSIGNED = 'UNASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  ATTACHMENT_ADDED = 'ATTACHMENT_ADDED',
  ATTACHMENT_REMOVED = 'ATTACHMENT_REMOVED',
  ASSIGNEE_ADDED = 'ASSIGNEE_ADDED',
  ASSIGNEE_REMOVED = 'ASSIGNEE_REMOVED',
  CHECKLIST_ITEM_ADDED = 'CHECKLIST_ITEM_ADDED',
  CHECKLIST_ITEM_TOGGLED = 'CHECKLIST_ITEM_TOGGLED',
  CHECKLIST_ITEM_REMOVED = 'CHECKLIST_ITEM_REMOVED',
}

export enum TaskAssigneeRole {
  LEAD = 'LEAD',
  MEMBER = 'MEMBER',
}

export enum AttachmentType {
  IMAGE = 'IMAGE',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}

export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
}

export enum ReportAttachmentType {
  BEFORE = 'BEFORE',
  AFTER = 'AFTER',
}

export enum ContractType {
  FIXED_SCHEDULE = 'FIXED_SCHEDULE',
  HOUR_BUDGET = 'HOUR_BUDGET',
}

export enum OvertimePolicy {
  PRE_APPROVED = 'PRE_APPROVED',
  REAL_TIME = 'REAL_TIME',
  POST_APPROVAL = 'POST_APPROVAL',
}

export enum OvertimeDetectionSource {
  MANUAL = 'MANUAL',
  AUTO_BUDGET = 'AUTO_BUDGET',
  AUTO_SCHEDULE = 'AUTO_SCHEDULE',
}

export enum TimeEntryStatus {
  CLOCKED_IN = 'CLOCKED_IN',
  CLOCKED_OUT = 'CLOCKED_OUT',
  AUTO_OUT = 'AUTO_OUT',
}

export enum BreakType {
  LUNCH = 'LUNCH',
  SHORT = 'SHORT',
  OTHER = 'OTHER',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  AUTO = 'AUTO',
}

export enum DependencyType {
  FINISH_TO_START = 'FINISH_TO_START',
  START_TO_START = 'START_TO_START',
  FINISH_TO_FINISH = 'FINISH_TO_FINISH',
  START_TO_FINISH = 'START_TO_FINISH',
}

export enum SprintStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export enum EpicStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum TaskCreationScope {
  NONE = 'NONE',
  SELF = 'SELF',
  SPACE = 'SPACE',
  ORG = 'ORG',
}

export enum CustomFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  DROPDOWN = 'DROPDOWN',
  CHECKBOX = 'CHECKBOX',
  URL = 'URL',
  EMAIL = 'EMAIL',
}

export enum RecurrenceFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
  CUSTOM = 'CUSTOM',
}

export enum TimeOffStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELED = 'CANCELED',
  REFUNDED = 'REFUNDED',
}

// How a space (CompanyLocation) interprets attendance expectations.
export enum WorkModel {
  NONE = 'NONE',   // No attendance expectations (legacy behavior, no reminders)
  SHIFT = 'SHIFT', // Rota-assigned shift windows (supports cross-midnight)
  FIXED = 'FIXED', // Weekly fixed schedule (legacy TechnicianSchedule)
  TASK = 'TASK',   // Task-based, no scheduled end (safety net only)
}

// Ownership classification of a space (CompanyLocation) — orthogonal to its
// physical/workspace nature (derived from coords). CUSTOMER = a customer company
// you do work for (carries contact fields); replaces the retired B2B directory.
export enum SpaceKind {
  PROJECT = 'PROJECT',
  COMPANY = 'COMPANY',
  CUSTOMER = 'CUSTOMER',
}

// Lifecycle of a still-open clock-in relative to its expected shift end.
// The engine NEVER force-closes — it nudges and escalates.
export enum ShiftReminderState {
  NONE = 'NONE',
  REMINDED = 'REMINDED',
  OVERTIME_PENDING = 'OVERTIME_PENDING',
  OVERTIME_APPROVED = 'OVERTIME_APPROVED',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
}

// Recurrence pattern for a rota assignment (member → shift within a space).
export enum ShiftRecurrence {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  ONE_OFF = 'ONE_OFF',
}
