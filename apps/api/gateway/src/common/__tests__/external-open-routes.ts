/* eslint-disable max-len */
/**
 * Every route an EXTERNAL member can reach WITHOUT a permission decorator.

 * External members may now be given a workspace's clients, portal and equipment
 * (docs/plans/external-role-builder.md), so the line that protects the rest of
 * the organization is no longer one blanket @DenyExternal per controller. This
 * list is that line, reviewed route by route on 2026-10-13: each entry is
 * reachable on purpose and says what decides the answer instead of a permission.
 *
 * A NEW route that an external can reach with no permission fails here until
 * somebody adds it with a reason — or gives it a permission or @DenyExternal.
 */
export const EXTERNAL_OPEN_ROUTES: Record<string, string> = {
  // AssetsController: the logbook — custody, or canLogAssets / canManageAssets in the record's workspace, decided in the service
  'AssetCustodyController.createLog': 'AssetCustodyController',
  'AssetMineController.myLog': 'AssetMineController',
  'AssetCustodyController.presignLog': 'AssetCustodyController',
  'AssetCustodyController.removeLog': 'AssetCustodyController',
  // AttendanceController: the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)
  'ExtraTimeController.addOvertime': 'ExtraTimeController',
  'ExtraTimeController.approveExtraTime': 'ExtraTimeController',
  'AttendanceController.clockIn': 'AttendanceController',
  'AttendanceController.clockInLocations': 'AttendanceController',
  'AttendanceController.clockOut': 'AttendanceController',
  'BreaksController.endBreak': 'BreaksController',
  'BreaksController.getBreakStatus': 'BreaksController',
  'BreaksController.getBreaksForEntry': 'BreaksController',
  'AttendanceRecordsController.getHistory': 'AttendanceRecordsController',
  'AttendanceRecordsController.getLocationEntries': 'AttendanceRecordsController',
  'AttendanceRecordsController.getLocationEntriesBatch': 'AttendanceRecordsController',
  'ExtraTimeController.getPendingExtraTime': 'ExtraTimeController',
  'AttendanceController.getStatus': 'AttendanceController',
  'AttendanceController.heartbeat': 'AttendanceController',
  'AttendanceController.heartbeatBatch': 'AttendanceController',
  'BreaksController.listBreakRules': 'BreaksController',
  'ExtraTimeController.rejectExtraTime': 'ExtraTimeController',
  'ExtraTimeController.removeApprovedOvertime': 'ExtraTimeController',
  'AttendanceApprovalsController.reportExcursion': 'AttendanceApprovalsController',
  'ExtraTimeController.requestExtraTime': 'ExtraTimeController',
  'ExtraTimeController.resolveForgotClockOut': 'ExtraTimeController',
  'BreaksController.snoozeBreak': 'BreaksController',
  'BreaksController.startBreak': 'BreaksController',
  'WorklogController.worklogAdd': 'WorklogController',
  'WorklogController.worklogBatch': 'WorklogController',
  'WorklogController.worklogConfirm': 'WorklogController',
  'WorklogController.worklogDelete': 'WorklogController',
  'WorklogController.worklogDeleteAttachment': 'WorklogController',
  'WorklogController.worklogList': 'WorklogController',
  'WorklogController.worklogPresign': 'WorklogController',
  // AuthController: signing in and out, own session
  'AuthBiometricController.biometricDevices': 'AuthBiometricController',
  'AuthBiometricController.biometricEnroll': 'AuthBiometricController',
  'AuthBiometricController.biometricRevoke': 'AuthBiometricController',
  'AuthSessionsController.changePassword': 'AuthSessionsController',
  'AuthSessionsController.deleteAccount': 'AuthSessionsController',
  'AuthSessionsController.listSessions': 'AuthSessionsController',
  'AuthController.logout': 'AuthController',
  'AuthController.me': 'AuthController',
  'AuthSessionsController.revokeAllSessions': 'AuthSessionsController',
  'AuthSessionsController.revokeSession': 'AuthSessionsController',
  // BillingController: subscription STATUS only (the bill itself is @DenyExternal)
  'BillingController.getSubscription': 'BillingController',
  // ChatController: conversations the caller is in (their files, mute, unread total) and their OWN messages (edit/remove); contacts limited to shared workspaces
  'ChatController.badge': 'ChatController',
  'ChatController.edit': 'ChatController',
  'ChatController.mute': 'ChatController',
  'ChatController.presign': 'ChatController',
  'ChatController.remove': 'ChatController',
  'ChatController.contacts': 'ChatController',
  'ChatController.conversations': 'ChatController',
  'ChatController.history': 'ChatController',
  'ChatController.markRead': 'ChatController',
  'ChatController.openDirect': 'ChatController',
  'ChatController.sendMessage': 'ChatController',
  // Phase 3: groups only with people the caller may already message (asked per person), managed by the creator/a manager; a job's chat through the normal job gate (404); search joins the caller's own memberships
  'ChatController.capabilities': 'ChatController',
  'ChatController.createGroup': 'ChatController',
  'ChatController.renameGroup': 'ChatController',
  'ChatController.addMembers': 'ChatController',
  'ChatController.removeMember': 'ChatController',
  'ChatController.leaveGroup': 'ChatController',
  'ChatController.openTask': 'ChatController',
  'ChatController.search': 'ChatController',
  // PeopleController: one person, read only from the caller's own Team / Managers lists (404 otherwise)
  'PeopleController.person': 'PeopleController',
  // CustomersController: CRM — decided per client in auth-service by the caller's CRM reach (org ∪ the client's workspace), 404 outside it
  'CustomerAddressesController.addActivity': 'CustomerAddressesController',
  'CustomerAddressesController.addAddress': 'CustomerAddressesController',
  'CustomerContactsController.addContact': 'CustomerContactsController',
  'CustomersController.create': 'CustomersController',
  'CustomerAddressesController.deleteActivity': 'CustomerAddressesController',
  'CustomerAddressesController.deleteAddress': 'CustomerAddressesController',
  'CustomersController.due': 'CustomersController',
  'CustomersController.get': 'CustomersController',
  'CustomersController.list': 'CustomersController',
  'CustomerAddressesController.listActivities': 'CustomerAddressesController',
  'CustomerAddressesController.listAddresses': 'CustomerAddressesController',
  'CustomerContactsController.listContactCompanies': 'CustomerContactsController',
  'CustomerContactsController.listContacts': 'CustomerContactsController',
  'CustomerContactsController.promoteContact': 'CustomerContactsController',
  'CustomersController.remove': 'CustomersController',
  'CustomersController.removeContact': 'CustomersController',
  'CustomerAddressesController.setPrimaryAddress': 'CustomerAddressesController',
  'CustomersController.update': 'CustomersController',
  'CustomerAddressesController.updateActivity': 'CustomerAddressesController',
  'CustomerAddressesController.updateAddress': 'CustomerAddressesController',
  'CustomersController.updateContact': 'CustomersController',
  // DocumentsController: the caller's OWN personnel file and the signing chain they are routed on (external members have no file)
  'DocumentSigningController.acknowledge': 'DocumentSigningController',
  'DocumentSigningController.consent': 'DocumentSigningController',
  'DocumentsController.deleteOwn': 'DocumentsController',
  'DocumentSigningController.documentChain': 'DocumentSigningController',
  'DocumentsController.downloadUrl': 'DocumentsController',
  'DocumentSigningController.events': 'DocumentSigningController',
  'DocumentsController.export': 'DocumentsController',
  'DocumentsController.list': 'DocumentsController',
  'DocumentTypesController.listTypes': 'DocumentTypesController',
  'DocumentComplianceController.pending': 'DocumentComplianceController',
  'DocumentDraftsController.presignOwnUpload': 'DocumentDraftsController',
  'DocumentDraftsController.readOwnUpload': 'DocumentDraftsController',
  'DocumentComplianceController.requirements': 'DocumentComplianceController',
  'DocumentSigningController.sendBack': 'DocumentSigningController',
  'DocumentSigningController.sign': 'DocumentSigningController',
  'DocumentDraftsController.submitOwnDocument': 'DocumentDraftsController',
  // MembersController: own schedule and leave; another person only inside the caller's rota/view scope (assertMemberInScope)
  'TimeOffAdminController.cancelTimeOff': 'TimeOffAdminController',
  'MemberTimeOffController.countLeave': 'MemberTimeOffController',
  'MemberRecordsController.getEmployeeSchedule': 'MemberRecordsController',
  'MemberTimeOffController.getEmployeeTimeOff': 'MemberTimeOffController',
  'MemberTimeOffController.getLeaveBalance': 'MemberTimeOffController',
  'MemberCoverController.getRequestOptions': 'MemberCoverController',
  'MemberCoverController.precheckRequest': 'MemberCoverController',
  'LeaveLedgerController.listLeaveAdjustments': 'LeaveLedgerController',
  'MemberTimeOffController.requestTimeOff': 'MemberTimeOffController',
  // GeoController: timezone lookup for a point — no organization data
  'GeoController.timezone': 'GeoController',
  // SpacesController: spaceListScope forces 'own' for external members; member routes decided per workspace in the path
  'SpaceAssignmentsController.assignMember': 'SpaceAssignmentsController',
  'SpacesController.findAll': 'SpacesController',
  'SpacesController.findOne': 'SpacesController',
  'SpaceAssignmentsController.getLocationMembers': 'SpaceAssignmentsController',
  'SpacesController.getRosters': 'SpacesController',
  'SpacesController.getTeam': 'SpacesController',
  'SpaceAssignmentsController.removeAssignment': 'SpaceAssignmentsController',
  'SpaceAssignmentsController.updateAssignment': 'SpaceAssignmentsController',
  // OnboardingController: the caller's own onboarding
  'OnboardingController.acceptInvitation': 'OnboardingController',
  'OnboardingController.cancelJoinRequest': 'OnboardingController',
  'OnboardingController.createOrganization': 'OnboardingController',
  'OnboardingController.getStatus': 'OnboardingController',
  'OnboardingController.submitJoinRequest': 'OnboardingController',
  'OnboardingController.validateOrgCode': 'OnboardingController',
  // OrganizationsController: audit trail needs the org-wide canViewAllTasks flag (no external holds one); contacts limited to shared workspaces
  'AuditLogController.getAuditLogs': 'AuditLogController',
  'OrgMembersController.listContacts': 'OrgMembersController',
  // OvertimeController: the caller's own extra-time requests
  'OvertimeController.approveSignature': 'OvertimeController',
  'OvertimeController.getActive': 'OvertimeController',
  'OvertimeController.respond': 'OvertimeController',
  // PortalController: customer portal — @AllowCustomer + CustomerScopeGuard refuse every non-CUSTOMER account
  'PortalController.assets': 'PortalController',
  'PortalController.config': 'PortalController',
  'PortalController.getRequest': 'PortalController',
  'PortalController.listRequests': 'PortalController',
  'PortalController.submitRequest': 'PortalController',
  'PortalController.units': 'PortalController',
  // ReportsController: a job's service report — the job's access rule
  'ReportsController.addAttachment': 'ReportsController',
  'ReportsController.addPart': 'ReportsController',
  'ReportsController.completeTask': 'ReportsController',
  'ReportsController.deleteAttachment': 'ReportsController',
  'ReportsController.deletePart': 'ReportsController',
  'ReportsController.getPresignedUrl': 'ReportsController',
  'ReportsController.getTaskReport': 'ReportsController',
  'ReportsController.updatePart': 'ReportsController',
  'ReportsController.updateReport': 'ReportsController',
  // SearchController: own jobs only unless the org-wide canViewAllTasks flag is held (people and clients never for externals)
  'SearchController.search': 'SearchController',
  // ShiftIssuesController: own shift issues; others' through attendanceAuthority (scopeFor)
  'ShiftIssuesController.acknowledge': 'ShiftIssuesController',
  'ShiftIssuesController.assign': 'ShiftIssuesController',
  'ShiftIssuesController.create': 'ShiftIssuesController',
  'ShiftIssuesController.get': 'ShiftIssuesController',
  'ShiftIssuesController.list': 'ShiftIssuesController',
  'ShiftIssuesController.message': 'ShiftIssuesController',
  'ShiftIssuesController.presign': 'ShiftIssuesController',
  'ShiftIssuesController.setStatus': 'ShiftIssuesController',
  // SpaceMemberPermissionsController: the permission builder — decided inline: canGrantSpaceRoles in the path workspace, ceiling, external allow-list
  'SpaceMemberPermissionsController.get': 'SpaceMemberPermissionsController',
  'SpaceMemberPermissionsController.set': 'SpaceMemberPermissionsController',
  // SpaceRolesController: decided inline per workspace in the path (mayManageSpaceMembers / canAddSpaceMembers / canGrantSpaceRoles) — bill rates and trades need canManageUsers, which no external may hold
  'SpaceMembersController.assignMember': 'SpaceMembersController',
  'SpaceRolesController.dropWorkRole': 'SpaceRolesController',
  'SpaceMembersController.listMembers': 'SpaceMembersController',
  'SpaceRolesController.listRateHistory': 'SpaceRolesController',
  'SpaceRolesController.listSpaceRoles': 'SpaceRolesController',
  'SpaceMembersController.removeMember': 'SpaceMembersController',
  'SpaceRolesController.setRoleDayRate': 'SpaceRolesController',
  'SpaceMembersController.updateMemberRate': 'SpaceMembersController',
  'SpaceMembersController.updateMemberRoles': 'SpaceMembersController',
  'SpaceMembersController.updateMemberRouting': 'SpaceMembersController',
  'SpaceRolesController.useWorkRole': 'SpaceRolesController',
  // SupportController: the caller's own support tickets
  'SupportController.createTicket': 'SupportController',
  'SupportController.getConfig': 'SupportController',
  'SupportController.getMine': 'SupportController',
  'SupportController.listMine': 'SupportController',
  'SupportController.readMine': 'SupportController',
  'SupportController.reply': 'SupportController',
  // ApprovalsController: reads the existing pending lists and calls their existing actions AS the caller — every guard re-runs
  'ApprovalsController.count': 'ApprovalsController',
  'ApprovalsController.decide': 'ApprovalsController',
  'ApprovalsController.decideDay': 'ApprovalsController',
  'ApprovalsController.list': 'ApprovalsController',
  'ApprovalsController.route': 'ApprovalsController',
  'ApprovalsController.listStandIns': 'ApprovalsController',
  'ApprovalsController.createStandIn': 'ApprovalsController',
  'ApprovalsController.endStandIn': 'ApprovalsController',
  // Office rules: checked inside (admin, or canManageUsers org-wide on their OWN access — never an external member).
  'ApprovalsController.listRules': 'ApprovalsController',
  'ApprovalsController.ruleInsights': 'ApprovalsController',
  'ApprovalsController.createRule': 'ApprovalsController',
  'ApprovalsController.updateRule': 'ApprovalsController',
  'ApprovalsController.deleteRule': 'ApprovalsController',
  // SyncController: the phone's own offline sync, filtered to what the caller can read
  'SyncController.mediaLinks': 'SyncController',
  'SyncController.pull': 'SyncController',
  'SyncController.push': 'SyncController',
  'SyncController.telemetry': 'SyncController',
  // TaskCustomFieldsController: a job's custom fields — the job's access rule; externals only on jobs they raised (assertExternalMayWriteTask)
  'TaskCustomFieldsController.getTaskValues': 'TaskCustomFieldsController',
  'TaskCustomFieldsController.setTaskValues': 'TaskCustomFieldsController',
  // TaskReportController: the job report — the job's normal access rule, 404 otherwise
  'TaskReportController.fullReport': 'TaskReportController',
  // TasksController: a job — canAccessTask on the job's own workspace (assigned, creator, or view-all there)
  'TaskAttachmentsController.addAttachment': 'TaskAttachmentsController',
  'TaskActivityController.addComment': 'TaskActivityController',
  'TaskCrewController.addHandover': 'TaskCrewController',
  'TasksController.declineTask': 'TasksController',
  'TaskAttachmentsController.deleteAttachment': 'TaskAttachmentsController',
  'TaskListController.findAll': 'TaskListController',
  'TasksController.findOne': 'TasksController',
  'TaskAttachmentsController.getAttachments': 'TaskAttachmentsController',
  'TaskActivityController.getComments': 'TaskActivityController',
  'TaskAttachmentsController.getPresignedUrl': 'TaskAttachmentsController',
  'TaskListController.getStatusCounts': 'TaskListController',
  'TaskActivityController.getSubmissions': 'TaskActivityController',
  'TaskChecklistController.getSubtasks': 'TaskChecklistController',
  'TaskActivityController.getTimeline': 'TaskActivityController',
  'TaskCrewController.jobTime': 'TaskCrewController',
  'TaskListController.jobTimeReport': 'TaskListController',
  'TaskListController.myHandovers': 'TaskListController',
  'TaskCrewController.resumeWork': 'TaskCrewController',
  'TasksController.updateStatus': 'TasksController',
  // TrackingController: the caller's own location updates
  'TrackingController.updateLocation': 'TrackingController',
  'TrackingController.updateLocationBatch': 'TrackingController',
  // UsersController: own profile, own push tokens, own preferences
  'UserDevicesController.avatarRemove': 'UserDevicesController',
  'UserDevicesController.avatarUpload': 'UserDevicesController',
  'UserDirectoryController.findOne': 'UserDirectoryController',
  'UsersController.getNotificationPrefs': 'UsersController',
  'UsersController.getProfile': 'UsersController',
  'UserDirectoryController.getWorkerTasks': 'UserDirectoryController',
  'UsersController.listNotifications': 'UsersController',
  'UsersController.markNotificationsRead': 'UsersController',
  'UserDevicesController.registerPushToken': 'UserDevicesController',
  'UserDevicesController.removePushToken': 'UserDevicesController',
  'UsersController.updateMe': 'UsersController',
  'UsersController.updateMyEmail': 'UsersController',
  'UsersController.updateNotificationPrefs': 'UsersController',
};

/** Why each controller's open routes are safe — the reason the list above points at. */
export const EXTERNAL_OPEN_REASONS: Record<string, string> = {
  ApprovalsController:
    "the inbox reads the thirteen existing pending lists and decides through their existing actions by calling those routes AS the caller (self-dispatch) — each route's own guard and workspace scope decide what an external member gets",
  AssetsController:
    "the logbook — custody, or canLogAssets / canManageAssets in the record's workspace, decided in the service",
  AssetCustodyController:
    "the logbook — custody, or canLogAssets / canManageAssets in the record's workspace, decided in the service",
  AssetMineController:
    "the logbook — custody, or canLogAssets / canManageAssets in the record's workspace, decided in the service",
  AttendanceController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  AttendanceApprovalsController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  AttendanceRecordsController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  AttendanceReportsController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  BreaksController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  EntryEditsController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  ExtraTimeController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  WorklogController:
    "the caller's OWN clock, shifts, breaks and work log (an external holds no clock — the clock module refuses them in the service)",
  AuthController: 'signing in and out, own session',
  AuthBiometricController: 'signing in and out, own session',
  AuthSessionsController: 'signing in and out, own session',
  BillingController: 'subscription STATUS only (the bill itself is @DenyExternal)',
  ChatController:
    "conversations the caller is in (their files, mute, unread total) and the caller's OWN messages (edit/remove, 15 min); contacts limited to shared workspaces; a group only with people the caller may already message, changed by its creator or a manager; a job's chat through the normal job gate (404); search inside the caller's own memberships only",
  PeopleController:
    "one person, built ONLY from the caller's own Team (shared workspaces) and Managers lists — anybody else is 404",
  CustomersController:
    "CRM — decided per client in auth-service by the caller's CRM reach (org ∪ the client's workspace), 404 outside it",
  CustomerContactsController:
    "CRM — decided per client in auth-service by the caller's CRM reach (org ∪ the client's workspace), 404 outside it",
  CustomerAddressesController:
    "CRM — decided per client in auth-service by the caller's CRM reach (org ∪ the client's workspace), 404 outside it",
  DocumentsController:
    "the caller's OWN personnel file and the signing chain they are routed on (external members have no file)",
  DocumentComplianceController:
    "the caller's OWN personnel file and the signing chain they are routed on (external members have no file)",
  DocumentDraftsController:
    "the caller's OWN personnel file and the signing chain they are routed on (external members have no file)",
  DocumentSigningController:
    "the caller's OWN personnel file and the signing chain they are routed on (external members have no file)",
  DocumentTypesController:
    "the caller's OWN personnel file and the signing chain they are routed on (external members have no file)",
  MembersController:
    "own schedule and leave; another person only inside the caller's rota/view scope (assertMemberInScope)",
  MemberCoverController:
    "own schedule and leave; another person only inside the caller's rota/view scope (assertMemberInScope)",
  MemberRecordsController:
    "own schedule and leave; another person only inside the caller's rota/view scope (assertMemberInScope)",
  MemberTimeOffController:
    "own schedule and leave; another person only inside the caller's rota/view scope (assertMemberInScope)",
  LeaveLedgerController:
    "own schedule and leave; another person only inside the caller's rota/view scope (assertMemberInScope)",
  TimeOffAdminController:
    "own schedule and leave; another person only inside the caller's rota/view scope (assertMemberInScope)",
  GeoController: 'timezone lookup for a point — no organization data',
  SpacesController: "spaceListScope forces 'own' for external members; member routes decided per workspace in the path",
  SpaceAssignmentsController:
    "spaceListScope forces 'own' for external members; member routes decided per workspace in the path",
  OnboardingController: "the caller's own onboarding",
  OrganizationsController:
    'audit trail needs the org-wide canViewAllTasks flag (no external holds one); contacts limited to shared workspaces',
  AuditLogController:
    'audit trail needs the org-wide canViewAllTasks flag (no external holds one); contacts limited to shared workspaces',
  OrgMembersController:
    'audit trail needs the org-wide canViewAllTasks flag (no external holds one); contacts limited to shared workspaces',
  OvertimeController: "the caller's own extra-time requests",
  PortalController: 'customer portal — @AllowCustomer + CustomerScopeGuard refuse every non-CUSTOMER account',
  ReportsController: "a job's service report — the job's access rule",
  SearchController:
    'own jobs only unless the org-wide canViewAllTasks flag is held (people and clients never for externals)',
  ShiftIssuesController: "own shift issues; others' through attendanceAuthority (scopeFor)",
  SpaceMemberPermissionsController:
    'the permission builder — decided inline: canGrantSpaceRoles in the path workspace, ceiling, external allow-list',
  SpaceRolesController:
    'decided inline per workspace in the path (mayManageSpaceMembers / canAddSpaceMembers / canGrantSpaceRoles) — bill rates and trades need canManageUsers, which no external may hold',
  SpaceMembersController:
    'decided inline per workspace in the path (mayManageSpaceMembers / canAddSpaceMembers / canGrantSpaceRoles) — bill rates and trades need canManageUsers, which no external may hold',
  SupportController: "the caller's own support tickets",
  SyncController: "the phone's own offline sync, filtered to what the caller can read",
  TaskCustomFieldsController:
    "a job's custom fields — the job's access rule; externals only on jobs they raised (assertExternalMayWriteTask)",
  TaskReportController: "the job report — the job's normal access rule, 404 otherwise",
  TasksController: "a job — canAccessTask on the job's own workspace (assigned, creator, or view-all there)",
  TaskActivityController: "a job — canAccessTask on the job's own workspace (assigned, creator, or view-all there)",
  TaskAttachmentsController: "a job — canAccessTask on the job's own workspace (assigned, creator, or view-all there)",
  TaskChecklistController: "a job — canAccessTask on the job's own workspace (assigned, creator, or view-all there)",
  TaskCrewController: "a job — canAccessTask on the job's own workspace (assigned, creator, or view-all there)",
  TaskListController: "a job — canAccessTask on the job's own workspace (assigned, creator, or view-all there)",
  TrackingController: "the caller's own location updates",
  UsersController: 'own profile, own push tokens, own preferences',
  UserDevicesController: 'own profile, own push tokens, own preferences',
  UserDirectoryController: 'own profile, own push tokens, own preferences',
};
