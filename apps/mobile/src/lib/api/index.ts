// Core HTTP client & token management
export {
  ApiError,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
  refreshAccessToken,
  setAuthFailureCallback,
  setUserRefreshedCallback,
  processOfflineQueue,
  fetchApi,
  fetchWithAuth,
  getApiUrl,
  resolveMediaUrl,
} from './client';

// All types (local + re-exported from @hbcfield/shared)
export type {
  User,
  LoginResponse,
  Task,
  Comment,
  TaskEvent,
  CreateTaskInput,
  UpdateTaskInput,
  LocationUpdate,
  LocationResponse,
  ServiceReport,
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
export { reportsApi, reportAttachmentsApi } from './reports';
export { taskAttachmentsApi, uploadToPresignedUrl } from './attachments';
export { attendanceApi } from './attendance';
export { techniciansApi, timeOffApi, availabilityApi, scheduleApi } from './technicians';
export { onboardingApi, invitationsApi, pushApi } from './onboarding';
export { joinRequestsApi, membersApi, adminInvitationsApi, orgSettingsApi, teamApi } from './admin';
export type { JoinRequest, OrgMember, Invitation, CreateInvitationInput, Colleague } from './admin';
export { overtimeApi } from './overtime';
export type { OvertimeRequest } from './overtime';
export { locationsApi } from './locations';

export { supportApi } from './support';
export { chatApi } from './chat';
export type { SupportConfig } from './support';
export type { LocationAssignment, AssignMemberInput, LocationWithMembers } from './locations';
export { customFieldsApi } from './custom-fields';
export type { MobileCustomFieldDefinition, MobileCustomFieldValue, MobileCustomFieldType } from './custom-fields';
export * from './documents';
