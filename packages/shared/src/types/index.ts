/** Shared types — the entry: enums and modules re-exported, entities in ./entities/, the rest in their own files. */

// Re-export all enums from dedicated file (avoids require cycles with sub-modules)
export {
  Role, Platform, AccessLevel, TaskStatus, TaskPriority, TaskEventType,
  AttachmentType, AssetStatus, ReportAttachmentType, TaskAssigneeRole,
  ContractType, OvertimePolicy, OvertimeDetectionSource,
  TimeEntryStatus, BreakType, ApprovalStatus, WORKER_ROLE,
  DependencyType, SprintStatus, EpicStatus,
  CustomFieldType, RecurrenceFrequency,
  TaskCreationScope, TimeOffStatus, InvoiceStatus,
  WorkModel, SpaceKind, ShiftReminderState, ShiftRecurrence,
} from './enums';
export {
  getDefaultModules, hasModule, hasAccessModule, canReceiveTasks, byAssignableFirst, canUsePlatform,
  getModuleLabel, getModules,
  getSpaceScope, getAccessPlatforms, canContactColleagues,
  getFeatureModules, hasFeatureModule, DEFAULT_ORG_MODULES,
  type MobileModule, type AccessProfile, type SpaceScope, type AccessPlatform,
  DEFAULT_MODULES, ALL_MODULES,
  // Modules an external member cannot hold — clock and time_off describe an
  // employment we do not have with them.
  filterExternalModules, moduleAllowedForExternal, EXTERNAL_FORBIDDEN_MODULES,
  // Editable access draft — shared by member-edit, invite pre-config, backend accept
  FEATURE_TAB_MODULES, defaultAccessDraft, readAccessDraft, serializeAccessDraft, normalizeAccessProfile,
  type AccessDraft, type AccessPersisted,
} from './modules';
export * from './schedule';
export * from './task-flow';
export * from './permissions';
// Export attendance types
export * from './attendance';
// Export shift-scheduling types (space-centric attendance)
export * from './shift';
// Export employee types (file still named technician.ts for git history)
export * from './technician';
// Export invitation types
export * from './invitation';
// Export onboarding types
export * from './onboarding';
// Export route-planning types (mobile field feature)
export * from './crm';

export { LegacyRoleMap, normalizeRole, SocketEvents } from './entities/roles-events';
export {
  type ApiResponse,
  type PaginationParams,
  type BaseEntity,
  type User,
  DEFAULT_PERMISSIONS,
  type ProfileBadgesConfig,
  DEFAULT_PROFILE_BADGES,
} from './entities/api-user';
export {
  AVAILABLE_MODULES,
  moduleI18n,
  MODULE_GROUPS,
  MODULE_DEPENDENCIES,
  moduleRequires,
  CUSTOMER_STAGES,
  type CustomerStageKey,
  customerStageLabel,
  resolveModuleDependencies,
  effectiveSpaceModules,
  MODULE_PRESETS,
  type ModuleKey,
} from './entities/org-modules';
export type {
  Organization,
  EmployeeAssignment,
  TechnicianAssignment,
  OrganizationAccess,
} from './entities/organization';
export {
  type TaskAssignee,
  type ChecklistItem,
  type Task,
  type Phase,
  type Sprint,
  type Epic,
  type SprintReport,
  type DefinitionOfDone,
  type VelocityDataPoint,
  STORY_POINT_OPTIONS,
  SCHEDULE_TYPES,
  POSITION_SUGGESTIONS,
  type TaskDependency,
  type TaskDependencyWithTask,
  type Comment,
  type Attachment,
  type TaskEvent,
  type WorkerLocation,
} from './entities/task';
export type {
  AssetCategory,
  AssetType,
  Asset,
  AssetWithHistory,
  ServiceReportSummary,
  ServiceReport,
  ReportAttachment,
  PartUsed,
  CompleteTaskInput,
} from './entities/asset';
export {
  type StatusWorkflow,
  type WorkflowStatus,
  type CustomFieldDefinition,
  type CustomFieldValue,
  type RecurringTaskTemplate,
  PERMISSION_SCHEMA,
  type PermissionKey,
} from './entities/workflow';
