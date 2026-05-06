// Shared enums — extracted to avoid require cycles between index.ts and sub-modules

export enum Role {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  DISPATCHER = 'DISPATCHER',
  TECHNICIAN = 'TECHNICIAN',
}

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

export enum WorkMode {
  ON_SITE = 'ON_SITE',
  ON_ROAD = 'ON_ROAD',
  HYBRID = 'HYBRID',
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
