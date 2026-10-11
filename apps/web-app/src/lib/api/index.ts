/**
 * The web's API, one module per domain (`./tasks.ts`, `./attendance.ts`, …),
 * every request through the shared client and endpoint table:
 * `call(tasksEndpoints.get, { id })` — `tasksEndpoints` IS `apiEndpoints.tasks`,
 * imported by its own name so a page bundles only the domains it calls
 * (next.config marks lib/api side-effect free; see the bundle note there).
 *
 * Screens import from here — `import { tasksApi, type Task } from "@/lib/api"` —
 * exactly the names the single 8,000-line api.ts exported before the split.
 */
export { API_BASE_URL } from '../endpoints';
export type { ApiResponse, RequestOptions } from '../http-client';
export { authApi } from './auth';
export { analyticsApi } from './analytics';
export { assetsApi } from './assets';
export { attendanceApi } from './attendance';
export { billingApi } from './billing';
export { calendarApi } from './calendar';
export { chatApi } from './chat';
export { customFieldsApi } from './custom-fields';
export { customersApi } from './customers';
export { documentsApi } from './documents';
export { employeesApi } from './employees';
export { epicsApi } from './epics';
export { invitationsApi } from './invitations';
export { invoicesApi } from './invoices';
export { joinRequestsApi } from './join-requests';
export { leaveLedgerApi } from './leave-ledger';
export { legalEntitiesApi } from './legal-entities';
export { locationsApi } from './locations';
export { onboardingApi } from './onboarding';
export { organizationsApi } from './organizations';
export { overtimeApi } from './overtime';
export { phasesApi } from './phases';
export { portalAdminApi } from './portal-admin';
export { rateHistoryApi } from './rate-history';
export { recurringTasksApi } from './recurring-tasks';
export { reportAttachmentsApi } from './report-attachments';
export { reportsApi } from './reports';
export { rotaApi } from './rota';
export { searchApi } from './search';
export { shiftIssuesApi } from './shift-issues';
export { shiftsApi } from './shifts';
export { signLinkApi } from './sign-link';
export { spaceMembersApi } from './space-members';
export { spacePortalApi } from './space-portal';
export { spaceRolesApi } from './space-roles';
export { spaceSharingApi } from './space-sharing';
export { spaceUnitsApi } from './space-units';
export { sprintsApi } from './sprints';
export { supportApi } from './support';
export { syncApi } from './sync';
export { taskAttachmentsApi } from './task-attachments';
export { tasksApi } from './tasks';
export { teamApi } from './team';
export { trackingApi } from './tracking';
export type { DatasetMeta, ReportCadence, ReportColumn, ReportDatePreset, ReportDefinition, ReportGranularity, ReportResult, SavedReport } from './types/analytics';
export type { Asset, AssetActivity, AssetCategory, AssetExpenseStatus, AssetListRow, AssetLogDue, AssetLogEntry, AssetMoneyEntry, AssetProposal, AssetStatus, ContractFields, ContractPreview, ContractReading, ContractStep, CustodyHolderRef, CustodyPeriodDto, MaintenanceHistoryItem, OrphanAsset, PendingExpense } from './types/assets';
export type { BreakPlanRow, BreakRuleRow, BreakSummary, EntryEditChange, EntryEditHistoryItem, NoShowRow } from './types/attendance';
export type { CalendarAttendee, CalendarAvailability, CalendarEventDetail, CalendarEventInput, CalendarPerson, CalendarRange, CalendarSettings, LeaveCountResult } from './types/calendar';
export type { CustomFieldDefinition, CustomFieldType, CustomFieldValue } from './types/custom-fields';
export type { Customer, CustomerActivity, CustomerAddress, CustomerContactLink, CustomerDetail } from './types/customers';
export type { BrowseFolder, BrowseLevel, ComplianceRow, ContractTemplateRow, DocumentChain, DocumentTypeRow, DraftDocumentRow, IssuedRegister, IssuedRow, MatchCandidateRow, MemberDocumentRow, PendingReviewRow, RequirementRow, RouteCandidateStep } from './types/documents';
export type { CoverDay, CoverVerdict, FloorPerson, FloorSpace, OrgTimeOffRequest, ScheduleEntry, ScheduleEntryInput, TimeOffRequest, TimeOffStatus } from './types/employees';
export type { LeaveBalance } from './types/employees';
export type { LeaveAdjustmentDto, LeaveBalanceLedgerFields, LeaveLedger, LeaveOpening, LeavePolicyFields, OpeningBalanceMatch, OpeningBalanceRowDto } from './types/leave-ledger';
export type { Epic } from './types/epics';
export type { Invoice, InvoiceItem, InvoiceItemInput, InvoiceStatus } from './types/invoices';
export type { LegalEntity, LegalEntityBankAccount, LegalEntityInput } from './types/legal-entities';
export type { CreateLocationInput, LocationAssignment, UpdateLocationInput } from './types/locations';
export type { AccessRole, MemberStatement, OrgMember, OrganizationProfile, UpdateMemberInput } from './types/organizations';
export type { OvertimeRequest, PaginationMeta } from './types/overtime';
export type { Phase } from './types/phases';
export type { PortalCategoryInput, PortalRequestView } from './types/portal-admin';
export type { RecurringFrequency, RecurringTaskTemplate } from './types/recurring-tasks';
export type { ReportAttachment, ReportAttachmentType } from './types/report-attachments';
export type { PartUsed, ServiceReport, ServiceReportSummary } from './types/reports';
export type { CreateRotaInput } from './types/rota';
export type { ShiftIssue, ShiftIssueEvent, ShiftIssueSeverity, ShiftIssueStatus, WorkLogAttachmentInput } from './types/shift-issues';
export type { CreateShiftInput } from './types/shifts';
export type { LinkDocumentRow, LinkOpenResult, LinkRefusal } from './types/sign-link';
export type { PortalSummary } from './types/space-portal';
export type { SpaceShare, SpaceShareLevel, SpaceShareRequestStatus, SpaceShareRequestType, SpaceShareStatus } from './types/space-sharing';
export type { SpaceUnit } from './types/space-units';
export type { Sprint } from './types/sprints';
export type { Attachment } from './types/task-attachments';
export type { CandidateState, ChecklistItem, ChecklistPerson, Comment, CreateTaskInput, CrewView, JobTimeReport, JobTimeSplit, JobTimeView, OnBehalf, OpenRoleTask, RoleOption, RolePreview, RoleStats, Task, TaskAssignee, TaskDependency, TaskEvent, TaskHandover, TaskStepSubmission, TasksListResponse, UpdateTaskInput } from './types/tasks';
export type { InboxNotification } from './types/users';
export type { StatusWorkflow, WorkflowStatus } from './types/workflows';
export type { WorkLogAttachment, WorkLogNote } from './types/worklog';
export { uploadToS3 } from './uploads';
export { STORY_POINT_OPTIONS, usersApi } from './users';
export { workflowsApi } from './workflows';
export { worklogApi } from './worklog';

// Shared types and helpers screens have always imported from here.
export type {
  BreakStatus, Break, CompanyLocation, CreateEmployeeInput, CreateInvitationInput, EmployeeListItem, EmployeeProfile,
  EmployeeStats, EmployeesQueryParams, Invitation, InvitationValidation, JoinRequest, OnboardingStatus, OrgCodeValidation,
  PaginatedResponse, PerformanceMetrics, TimeEntry, UpdateEmployeeInput,
  IntakeCategory as PortalIntakeCategory, CustomerUnit as PortalCustomerUnit,
} from '@hbcfield/shared/client';
export { isBreakActive, TimeEntryStatus, BreakType, InvitationStatus, JoinRequestStatus, JoinPolicy } from '@hbcfield/shared/client';
