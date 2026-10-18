// Core HTTP client & token management
export {
  ApiError,
  getAccessToken,
  getFreshAccessToken,
  setAuthFailureCallback,
  setUserRefreshedCallback,
  resolveMediaUrl,
} from './client';

// All types (local + re-exported from @hbcfield/shared)
export type {
  OpenRoleTask,
  JobTimeView,
  CrewView,
  JobTimeSplit,
  MyHandovers,
  HandoverJob,
  User,
  Task,
  Comment,
  TaskEvent,
  CreateTaskInput,
  UpdateTaskInput,
  ServiceReport,
  StepSubmission,
  TimeOffRequest,
  AvailabilityResponse,
  ScheduleEntry, // Re-exported from @hbcfield/shared
  CompanyLocation,
  TimeEntry,
  TechnicianListItem,
} from './types';

// Re-exported enums from @hbcfield/shared
export { TaskStatus } from './types';

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
export { membersApi, adminInvitationsApi, teamApi } from './admin';
export type { OrgMember, Invitation, Colleague } from './admin';
export { overtimeApi } from './overtime';
export type { OvertimeRequest } from './overtime';
export { locationsApi } from './locations';
export { assetsApi, assetProposalsApi, assetRegisterApi, REGISTER_PAGE_SIZE } from './assets';
export { portalOfficeApi } from './portal-office';
export type { OfficeRequest } from './portal-office';
export type {
  RegisterAsset,
  RegisterHolder,
  RegisterLogEntry,
  HeldAsset,
  MyExpense,
  DueItem,
  ContractFields,
} from './assets';

export { supportApi } from './support';
export { chatApi } from './chat';
export type { SupportConfig } from './support';
export type { LocationAssignment } from './locations';
export { customFieldsApi } from './custom-fields';
export type { MobileCustomFieldDefinition, MobileCustomFieldValue } from './custom-fields';
export * from './documents';
export { calendarApi } from './calendar';
export type { CalendarRange, CalendarEventDetail, CalendarPerson, LeaveCount } from './calendar';
export * from './approvals';
