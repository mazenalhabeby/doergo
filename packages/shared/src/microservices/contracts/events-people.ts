/** Events about people, workspaces and the organization: members, sessions, invitations, join requests, rosters, routing, app versions. */
import { event } from '../event';

export const spaceChangedEvent = event<{ organizationId: string; spaceId?: string | null }>('space_changed');

export const spaceRosterChangedEvent = event<{ organizationId: string; spaceId?: string | null }>(
  'space_roster_changed',
);

export const joinRequestSubmittedEvent = event<{
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  message?: string;
  recipientIds?: string[];
}>('join_request_submitted');

export const joinRequestApprovedEvent = event<{
  userId: string;
  organizationId: string;
  organizationName: string;
  role: string;
  approvedByName: string;
}>('join_request_approved');

export const joinRequestRejectedEvent = event<{
  userId: string;
  organizationId: string;
  organizationName: string;
  reason?: string;
  rejectedByName: string;
}>('join_request_rejected');

export const userLocaleChangedEvent = event<{ userId: string }>('user_locale_changed');

export const userRemovedEvent = event<{ userId: string; organizationId: string }>('user_removed');

export const userSessionsRevokedEvent = event<{ userId: string }>('user_sessions_revoked');

export const organizationSuspendedEvent = event<{ organizationId: string }>('organization_suspended');

export const memberAccessUpdatedEvent = event<{ memberId: string; organizationId: string }>('member_access_updated');

export const memberChangedEvent = event<{ organizationId: string; memberId?: string; reason?: string }>(
  'member_changed',
);

export const invitationCreatedEvent = event<{
  recipientEmail: string;
  organizationName: string | null;
  /** ⚠️ null for an invitation that has no plain code stored — kept as it is. */
  invitationCode: string | null;
  targetRole: string;
  expiresAt: string;
  /** The member who created it — their language is the email's fallback. */
  inviterId?: string | null;
  /** Already decided by the sender — a client's invitation (see EmailService). */
  locale?: string | null;
}>('invitation_created');

/** Handled by task-service (NotificationRoutingController): drop the cached routing. */
export const notificationRoutingChangedEvent = event<{ organizationId?: string; subjectUserId?: string }>(
  'notification_routing_changed',
);

/**
 * Handled by task-service (MemberClockController): an administrator switched their own clock off or on (clock
 * review A7). Off: the shifts still ahead are not expected any more (no no-show chasing) — the owner's write.
 */
export const memberClockSwitchedEvent = event<{ organizationId: string; userId: string; clockOff: boolean }>(
  'member_clock_switched',
);

/**
 * Handled by task-service (MembersController): a member was switched off (deactivated — reversible, so NOT the
 * offboarding). A shift still running closes through the office close; the shifts still ahead are not expected.
 */
export const memberDeactivatedEvent = event<{ organizationId: string; userId: string }>('member_deactivated');

/** Handled by auth-service (UsersController): which app version a member's phone runs. */
export const appVersionSeenEvent = event<{ userId: string; version: string; platform?: string }>('app_version_seen');
