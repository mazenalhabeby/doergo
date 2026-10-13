/**
 * THE endpoint table — every path both apps call, defined once.
 *
 * Add an endpoint where its domain lives (see ../README.md). A web-only
 * domain lives in `web/<domain>.ts` and gets a line in `apiEndpoints` below;
 * web-only routes of a domain both apps share are merged into it
 * (`billing: { ...billingEndpoints, ...billingWebEndpoints }`). The operator console's `/platform/*`
 * routes are the one exception: `platform-admin.ts` exports its own registry,
 * `platformEndpoints` (an operator token, never a member's).
 */
import { approvalsEndpoints } from './approvals';
import { assetCategoriesEndpoints, assetsEndpoints } from './assets';
import { attendanceEndpoints, overtimeEndpoints, shiftIssuesEndpoints, worklogEndpoints } from './attendance';
import { calendarEndpoints } from './calendar';
import { chatEndpoints, notificationsEndpoints, supportEndpoints } from './comms';
import { customersEndpoints } from './customers';
import { documentsEndpoints, signLinkEndpoints } from './documents';
import { invitationsEndpoints, joinRequestsEndpoints, locationsEndpoints, onboardingEndpoints, organizationsEndpoints, appEndpoints } from './organization';
import { employeesEndpoints, rotaEndpoints, shiftsEndpoints, timeOffEndpoints } from './people';
import { authEndpoints, billingEndpoints, geoEndpoints, routesEndpoints, syncEndpoints, trackingEndpoints, usersEndpoints } from './platform';
import { portalEndpoints } from './portal';
import { reportsEndpoints, tasksEndpoints } from './tasks';
import {
  analyticsWebEndpoints,
  billingWebEndpoints,
  blogWebEndpoints,
  customFieldsWebEndpoints,
  epicsWebEndpoints,
  invoicesWebEndpoints,
  legalEntitiesWebEndpoints,
  phasesWebEndpoints,
  portalAdminWebEndpoints,
  rateHistoryWebEndpoints,
  recurringTasksWebEndpoints,
  searchWebEndpoints,
  spaceMembersWebEndpoints,
  spacePortalWebEndpoints,
  spaceRolesWebEndpoints,
  spaceSharingWebEndpoints,
  spaceUnitsWebEndpoints,
  sprintsWebEndpoints,
  workflowsWebEndpoints,
} from './web';

export * from './assets';
export * from './attendance';
export * from './calendar';
export * from './comms';
export * from './customers';
export * from './documents';
export * from './organization';
export * from './people';
export * from './platform';
export * from './platform-admin';
export * from './portal';
export * from './tasks';
export * from './approvals';
export * from './web';

/** Every domain by name — `apiEndpoints.tasks.get`, and what the tests walk. */
export const apiEndpoints = {
  approvals: approvalsEndpoints,
  auth: authEndpoints,
  users: usersEndpoints,
  notifications: notificationsEndpoints,
  tasks: tasksEndpoints,
  reports: reportsEndpoints,
  attendance: attendanceEndpoints,
  worklog: worklogEndpoints,
  shiftIssues: shiftIssuesEndpoints,
  overtime: overtimeEndpoints,
  employees: employeesEndpoints,
  timeOff: timeOffEndpoints,
  rota: rotaEndpoints,
  shifts: shiftsEndpoints,
  documents: documentsEndpoints,
  signLink: signLinkEndpoints,
  assets: assetsEndpoints,
  assetCategories: assetCategoriesEndpoints,
  customers: customersEndpoints,
  calendar: calendarEndpoints,
  chat: chatEndpoints,
  support: supportEndpoints,
  portal: portalEndpoints,
  locations: locationsEndpoints,
  organizations: organizationsEndpoints,
  invitations: invitationsEndpoints,
  joinRequests: joinRequestsEndpoints,
  onboarding: onboardingEndpoints,
  app: appEndpoints,
  routes: routesEndpoints,
  geo: geoEndpoints,
  sync: syncEndpoints,
  tracking: trackingEndpoints,
  // The web reads more of billing than the phone does (add-ons, checkout, portal, cancel).
  billing: { ...billingEndpoints, ...billingWebEndpoints },

  // ── web-only domains (endpoints/web/*): the office's screens ──
  workflows: workflowsWebEndpoints,
  sprints: sprintsWebEndpoints,
  epics: epicsWebEndpoints,
  phases: phasesWebEndpoints,
  customFields: customFieldsWebEndpoints,
  recurringTasks: recurringTasksWebEndpoints,
  invoices: invoicesWebEndpoints,
  legalEntities: legalEntitiesWebEndpoints,
  rateHistory: rateHistoryWebEndpoints,
  spaceRoles: spaceRolesWebEndpoints,
  spaceMembers: spaceMembersWebEndpoints,
  spaceSharing: spaceSharingWebEndpoints,
  spaceUnits: spaceUnitsWebEndpoints,
  spacePortal: spacePortalWebEndpoints,
  portalAdmin: portalAdminWebEndpoints,
  analytics: analyticsWebEndpoints,
  search: searchWebEndpoints,
  blog: blogWebEndpoints,
} as const;

export type ApiEndpoints = typeof apiEndpoints;
