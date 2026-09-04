import { SetMetadata } from '@nestjs/common';

export const DENY_EXTERNAL_KEY = 'denyExternalMember';

/**
 * Close this route to EXTERNAL members, whatever permission they hold.
 *
 * Some surfaces are the organization's own property rather than the work at a
 * site: its assets, its clients, its portals, its invoices. A client's or
 * partner's supervisor has no claim on any of them — the permission ceiling in
 * `EXTERNAL_ALLOWED_PERMISSIONS` says so in words — and yet they reached them,
 * because the gate asked the wrong question.
 *
 * `GET /assets` is `@RequirePermissionInSpace('canViewAllTasks')`, and
 * canViewAllTasks is a permission an external supervisor legitimately holds in
 * their space: it is how they follow the work they are there to supervise. One
 * permission was doing duty for two different things, so granting the first
 * silently granted the second, and an outsider could list the organization's
 * equipment.
 *
 * A permission ceiling cannot fix that — the permission is genuinely theirs.
 * The RELATIONSHIP is what disqualifies them, so the rule is stated about the
 * relationship, on the routes it applies to.
 *
 * Deliberately not a "hide the nav item" fix: the data was readable by anyone
 * who typed the URL or called the API.
 */
export const DenyExternal = () => SetMetadata(DENY_EXTERNAL_KEY, true);
