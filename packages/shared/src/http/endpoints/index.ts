/**
 * THE endpoint table — every path both apps call, defined once.
 *
 * Add an endpoint where its domain lives (see ../README.md). A web-only or
 * admin-only domain gets its own file here (e.g. `workflows.ts`) and a line in
 * `apiEndpoints` below — same pattern. The operator console's `/platform/*`
 * routes are the one exception: `platform-admin.ts` exports its own registry,
 * `platformEndpoints` (an operator token, never a member's).
 */
import { assetCategoriesEndpoints, assetsEndpoints } from './assets';
import { attendanceEndpoints, overtimeEndpoints, shiftIssuesEndpoints, worklogEndpoints } from './attendance';
import { calendarEndpoints } from './calendar';
import { chatEndpoints, notificationsEndpoints, supportEndpoints } from './comms';
import { customersEndpoints } from './customers';
import { documentsEndpoints, signLinkEndpoints } from './documents';
import { invitationsEndpoints, joinRequestsEndpoints, locationsEndpoints, onboardingEndpoints, organizationsEndpoints } from './organization';
import { employeesEndpoints, rotaEndpoints, shiftsEndpoints, timeOffEndpoints } from './people';
import { authEndpoints, billingEndpoints, geoEndpoints, routesEndpoints, syncEndpoints, trackingEndpoints, usersEndpoints } from './platform';
import { portalEndpoints } from './portal';
import { reportsEndpoints, tasksEndpoints } from './tasks';

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

/** Every domain by name — `apiEndpoints.tasks.get`, and what the tests walk. */
export const apiEndpoints = {
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
  routes: routesEndpoints,
  geo: geoEndpoints,
  sync: syncEndpoints,
  tracking: trackingEndpoints,
  billing: billingEndpoints,
} as const;

export type ApiEndpoints = typeof apiEndpoints;
