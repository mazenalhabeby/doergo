/**
 * The operator console (admin.hbcfield.com) — every `/platform/*` route it calls.
 * Gateway: modules/platform-admin (platform-auth, platform-admin,
 * platform-pricing, platform-support, platform-support-teams, platform-library).
 *
 * ⚠️ A SEPARATE REGISTRY (`platformEndpoints`), not part of `apiEndpoints`.
 * These routes take an OPERATOR token, which reaches every customer; the web
 * app and the phone hold a member token and never call them. Keeping the
 * console's table apart keeps the member apps' walk of `apiEndpoints` (and its
 * allow-list of public routes) about the member product only.
 *
 * ⚠️ Cursor lists (`orgs.list`, `audit.list`) answer `{ success, data,
 * nextCursor }`. Call them with `unwrap: 'raw'` — unwrapped by shape they would
 * be the rows alone and the cursor would be lost. Their result type is the raw
 * page for that reason.
 *
 * The answer shapes are produced by auth-service's platform-admin module and
 * read only by the console; they live here beside the routes that return them.
 */
export type {
  PlatformCursorPage,
  PlatformMeUser,
  PlatformMe,
  PlatformSessionResponse,
  PlatformLoginResponse,
  PlatformOverview,
  PlatformBillingAlert,
  PlatformOrgRow,
  PlatformOrgMember,
  PlatformOrgDetail,
  PlatformMailRouteStatus,
  PlatformMailStatus,
  PlatformStaffUser,
  PlatformPriceModule,
  PlatformPriceAddOn,
  PlatformPriceBand,
  PlatformPriceLadder,
  PlatformPriceList,
  PlatformStripeStatus,
} from './platform-admin/types';
export type {
  PlatformTicket,
  PlatformTicketMessage,
  PlatformInboxView,
  PlatformTeamMember,
  PlatformRoutingRule,
  PlatformTeam,
  PlatformTeamStaff,
  PlatformPinnedOrg,
  PlatformTemplateStatus,
  PlatformTemplateProblem,
  PlatformTemplate,
  PlatformAuditRow,
} from './platform-admin/support-types';
export {
  platformAuthEndpoints,
  platformOrgsEndpoints,
  platformSystemEndpoints,
  platformAlertsEndpoints,
  platformPricingEndpoints,
  platformSupportEndpoints,
  platformSupportTeamsEndpoints,
  platformLibraryEndpoints,
  platformStaffEndpoints,
  platformAuditEndpoints,
  platformEndpoints,
  type PlatformEndpoints,
} from './platform-admin/routes';
