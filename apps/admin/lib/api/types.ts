/**
 * What the console reads from the platform API, under the short names its
 * screens use. The shapes themselves live ONCE in @hbcfield/shared, beside the
 * routes that return them (packages/shared/src/http/endpoints/platform-admin.ts);
 * the capability list and the roles are the server's own (platform/permissions.ts).
 */
import { PLATFORM_ROLES } from '@hbcfield/shared/client';

export type { PlatformCapability as Cap, PlatformMe as Me, PlatformSessionResponse as SessionResponse, PlatformOverview as Overview, BillingMode, PlatformBillingAlert as BillingAlertRow, PlatformOrgRow as OrgRow, PlatformOrgDetail as OrgDetail, PlatformMailStatus as MailStatus, PlatformStaffUser as StaffUser, PlatformPriceList as PriceList, PlatformStripeStatus as StripeStatus, PlatformTicket as Ticket, PlatformTicketMessage as Msg, PlatformInboxView as InboxView, PlatformRoutingRule as TRule, PlatformTeam as Team, PlatformTeamStaff as TStaff, PlatformPinnedOrg as PinnedOrg, PlatformTemplate as Tpl, PlatformAuditRow as AuditRow } from '@hbcfield/shared/client';

/** The staff roles, in the order the console offers them. */
export const ROLES = PLATFORM_ROLES;

/** A cursor page as the screens read it: the rows, and the cursor for "Load more". */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}
