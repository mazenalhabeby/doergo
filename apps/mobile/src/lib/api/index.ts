// Core HTTP client & token management
export {
  ApiError,
  getAccessToken,
  getFreshAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
  refreshAccessToken,
  refreshSession,
  sessionOwnerId,
  sessionStartedAt,
  clearInflightRequests,
  setAuthFailureCallback,
  setUserRefreshedCallback,
  observeResponses,
  api,
  getApiUrl,
  resolveMediaUrl,
} from './client';
export type { RefreshOutcome } from './client';
export { path } from './path';

// All types (local + re-exported from @hbcfield/shared)
export type {
  OpenRoleTask,
  JobTimeView,
  CrewView,
  JobTimeSplit,
  MyHandovers,
  HandoverJob,
  TaskHandover,
  User,
  LoginResponse,
  Task,
  Comment,
  TaskEvent,
  ChecklistItem,
  CreateTaskInput,
  UpdateTaskInput,
  LocationUpdate,
  LocationResponse,
  ServiceReport,
  StepSubmission,
  CompleteTaskInput,
  PartUsedInput,
  RegisterPushTokenInput,
  TimeOffRequest,
  TechnicianAvailability,
  AvailabilityResponse,
  ScheduleEntry,
  // Re-exported from @hbcfield/shared
  CompanyLocation,
  TimeEntry,
  AttendanceStatus,
  Break,
  BreakStatus,
  ClockInInput,
  ClockOutInput,
  AttendanceHistoryParams,
  PaginatedResponse,
  InvitationValidation,
  AcceptInvitationInput,
  TechnicianListItem,
  TechniciansListResponse,
  GeofenceExcursion,
  GeofenceExcursionStatus,
} from './types';

// Re-exported enums from @hbcfield/shared
export {
  

  TimeEntryStatus,
  BreakType,
  Role,
  Platform,
  TaskStatus,
  TaskPriority,
} from './types';

// Domain APIs
export { authApi, userApi, passwordApi, avatarApi, accountApi } from './auth';
export { tasksApi, trackingApi } from './tasks';
export { routesApi } from './routes';
export { customersApi } from './customers';
export type { MobileCustomer, MobileCustomerActivity } from './customers';
export type { TasksListParams } from './tasks';
export { reportsApi } from './reports';
export { taskAttachmentsApi, uploadToPresignedUrl } from './attachments';
export { attendanceApi } from './attendance';
export type { NoShow } from './attendance';
export { techniciansApi, timeOffApi, availabilityApi, scheduleApi } from './technicians';
export { rotaApi, type RotaWeek, type RotaCell, type RotaShift } from './rota';
export { onboardingApi, invitationsApi, pushApi } from './onboarding';
export { joinRequestsApi, membersApi, adminInvitationsApi, orgSettingsApi, teamApi, rolesApi, type OrgRole } from './admin';
export type { JoinRequest, OrgMember, Invitation, CreateInvitationInput, Colleague } from './admin';
export { overtimeApi } from './overtime';
export type { OvertimeRequest } from './overtime';
export { locationsApi } from './locations';
export { assetsApi, assetProposalsApi, assetRegisterApi, REGISTER_PAGE_SIZE } from './assets';
export { portalOfficeApi } from './portal-office';
export type { OfficePortal, OfficeRequest } from './portal-office';
export type {
  RegisterAsset, RegisterHolder, RegisterLogEntry,
  HeldAsset, MyExpense, SubmitExpenseInput, MyLogEntry, DueItem, CreateLogInput,
  ContractFields,
  MyProposal, RaiseProposalInput,
} from './assets';

export { supportApi } from './support';
export { chatApi } from './chat';
export type { SupportConfig } from './support';
export type { LocationAssignment, AssignMemberInput, LocationWithMembers } from './locations';
export { customFieldsApi } from './custom-fields';
export type { MobileCustomFieldDefinition, MobileCustomFieldValue, MobileCustomFieldType } from './custom-fields';
export * from './documents';
export { calendarApi } from './calendar';
export type { CalendarRange, CalendarEventDetail, CalendarEventInput, CalendarPerson, LeaveCount } from './calendar';
export * from './approvals';
