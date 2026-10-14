import { sessionAccess } from './stand-in';
import {
  readAssignedHome,
  normalizeRole,
  isAdmin,
  isOrganizationSuspended,
  tokenIssuedBeforeCutoff,
  memberAccessOf,
} from '@hbcfield/shared';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveProfileBadges, orgPermissionFields } from './auth-common';
import { SessionTokensService } from './session-tokens.service';

/**
 * Turning an access token back into a request context — the door every
 * authenticated request passes through.
 *
 * Part of authentication; `AuthService` is the facade every caller uses.
 */
@Injectable()
export class TokenValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokens: SessionTokensService,
  ) {}

  async validateToken(token: string) {
    try {
      // Pin the algorithm so a token can't be verified under a different scheme
      // (none-alg / algorithm-confusion) — defense-in-depth (L10).
      const payload = this.jwtService.verify(token, { algorithms: ['HS256'] });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          organizationId: true,
          onboardingCompleted: true,
          // Works for a client or partner — the session carries it so every
          // screen that shows an account type shows the same one.
          isExternal: true,
          avatarUrl: true,
          isActive: true,
          // The session cut-off — see the check below.
          tokensValidAfter: true,
          // Permission fields
          canCreateTasks: true,
          taskCreationScope: true,
          canViewAllTasks: true,
          canAssignTasks: true,
          canManageUsers: true,
          canViewReports: true,
          allowRemote: true,
          presence: true,
          // Worker configuration
          position: true,
          scheduleType: true,
          // Technician-specific fields
          specialty: true,
          // Badge config
          profileBadges: true,
          // Per-user clock display preference ("24h" | "12h")
          timeFormat: true,
          clockInPick: true,
          // One-time welcome-tour flag (carried on req.user → /auth/me → web).
          guidesSeen: true,
          enabledModules: true,
          // Customer-portal binding (null for staff) — carried on req.user so
          // CustomerScopeGuard + portal endpoints scope to the caller's own data.
          customerId: true,
          unitId: true,
          // …and the ASSET a client login is confined to, so portal endpoints
          // can scope to it the way they already scope to a unit. Without this
          // req.user.assetId is undefined and the binding does nothing.
          assetId: true,
          organization: { select: { name: true, timezone: true, profileBadges: true, enabledModules: true, subStatus: true, planTier: true, addOns: true, currency: true, offlineMode: true, customerPortalEnabled: true, usesExternalWorkers: true, suspendedAt: true, ownerId: true } },
          // Custom role
          // Unified roles (Phase 2): org-wide role + per-space assignments. Read
          // to build the resolved `access` object. Legacy space memberships are
          // also read so per-space grants resolve before the backfill runs.
          // isActive so a deactivated role stops granting (M1); space grants are
          // filtered to their effective window so expired/future grants don't
          // contribute per-space permissions (L2).
          memberRole: { select: { permissions: true, isActive: true } },
          /*
            The role's ID, not only its permissions.

            A DOCUMENT TYPE may name the roles that can see it, so the id has to
            travel with the caller. This select is explicit, so an unselected
            scalar arrives as `undefined` and the visibility rule would quietly
            treat every restricted type as invisible — the failure would look
            like a permissions bug and be nothing of the kind.
          */
          memberRoleId: true,
          // The office-set home screen, carried on the session (see login).
          assignedHome: true,
          spaceAssignments: {
            where: {
              effectiveFrom: { lte: new Date() },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
            },
            select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
          },
        },
      });

      if (!user || !user.isActive) {
        return { valid: false };
      }

      /*
        An access token minted before the account's session cut-off is dead.

        A password change, a reset, an admin reset, "sign out everywhere" and a
        deactivation all delete the refresh tokens — but an access token is a
        signed statement that needs no row, and it went on working until it
        expired. This is what ends it at the moment of the change.
      */
      if (tokenIssuedBeforeCutoff(payload.iat, user.tokensValidAfter)) {
        return { valid: false };
      }

      /*
        The switch has to bite on the access token too.

        Login and refresh alone would let an already-signed-in member keep
        working until their refresh token next came due — and the gateway caches
        a validated user for AUTH_CACHE_TTL_SECONDS, so this is the door that
        makes suspension take effect in about a minute rather than an hour.
      */
      if (isOrganizationSuspended(user.organization)) {
        return { valid: false };
      }

      // Best-effort "last active" heartbeat. This runs ~once per minute per active
      // user (the gateway caches the validated user for AUTH_CACHE_TTL_SECONDS), so
      // it's naturally throttled — no per-request DB write. Fire-and-forget.
      this.prisma.user
        .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
        .catch(() => undefined);

      // tokensValidAfter is read for the check above and stays off req.user.
      const { organization, profileBadges, enabledModules: userModules, memberRole, spaceAssignments, tokensValidAfter: _cutoff, ...userData } = user;

      // Cross-org space shares RECEIVED by this user's org (ACTIVE only). Indexed
      // on [guestOrgId, status] → returns 0 rows for the vast majority of users
      // (one cheap round-trip, and the whole validate result is token-cached ~60s).
      // These are the ONLY foreign spaces this session can reach.
      const sharedGrants = userData.organizationId
        ? await this.prisma.spaceShare.findMany({
            where: { guestOrgId: userData.organizationId, status: 'ACTIVE' },
            select: {
              spaceId: true, ownerOrgId: true, level: true,
              showWorkers: true, showAttendance: true, showTracking: true, showReports: true, allowRequests: true,
            },
          })
        : [];
      let sharedSpaces: any[] | undefined;
      if (sharedGrants.length) {
        const spaceIds = sharedGrants.map((g) => g.spaceId);
        const ownerOrgIds = [...new Set(sharedGrants.map((g) => g.ownerOrgId))];
        const [spaces, orgs] = await Promise.all([
          this.prisma.companyLocation.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } }),
          this.prisma.organization.findMany({ where: { id: { in: ownerOrgIds } }, select: { id: true, name: true } }),
        ]);
        const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
        const orgName = new Map(orgs.map((o) => [o.id, o.name]));
        sharedSpaces = sharedGrants.map((g) => ({
          spaceId: g.spaceId,
          ownerOrgId: g.ownerOrgId,
          ownerOrgName: orgName.get(g.ownerOrgId),
          spaceName: spaceName.get(g.spaceId),
          level: g.level,
          showWorkers: g.showWorkers,
          showAttendance: g.showAttendance,
          showTracking: g.showTracking,
          showReports: g.showReports,
          allowRequests: g.allowRequests,
        }));
      }

      // Resolve the member's access ONCE here (server-side, from their own
      // roles/assignments + any cross-org shares). Cached with the validated user.
      const access = await sessionAccess(
        this.prisma,
        user,
        organization?.timezone,
        memberAccessOf({ ...userData, memberRole, spaceAssignments }, { sharedSpaces }),
      );
      return {
        valid: true,
        user: {
          ...userData,
          access,
          // The surface this session was opened from, straight off the SIGNED
          // token. The platform guard reads this instead of a request header,
          // so a client cannot skip the check by leaving the header out.
          plat: payload.plat,
          // Permission fields from `access`, never the raw columns — see
          // orgPermissionFields. Must come after the spread to win over it.
          ...orgPermissionFields(access, (userData as { taskCreationScope?: string | null }).taskCreationScope),
          // Canonicalize the role once at this boundary so every downstream
          // service (and the gateway's req.user) sees ADMIN/MANAGER/EMPLOYEE,
          // never the legacy CLIENT/DISPATCHER/TECHNICIAN values.
          /*
            The member's org-wide role id.

            Carried because a DOCUMENT TYPE may name the roles that can see it,
            and the answer has to travel with the caller rather than be looked up
            per request. One scalar on a query that already runs.

            ⚠️ THREE places build a request context in this file — login, refresh
            and validate. All three must set it, or documents restricted to a
            role become invisible on whichever path missed it.
          */
          memberRoleId: (userData as { memberRoleId?: string | null }).memberRoleId ?? null,
          assignedHome: readAssignedHome((userData as { assignedHome?: unknown }).assignedHome),
          role: normalizeRole(userData.role),
          organizationName: organization?.name || null,
          // Must match the login path exactly — see orgAddOns for what happens
          // when one context builder knows something the other does not.
          isOwner: !!organization?.ownerId && organization.ownerId === user.id,
          // Org timezone — the default display zone for all times on the client
          // (attendance times override per-entry with the location's timezone).
          organizationTimezone: organization?.timezone || null,
          // Opt-in capability: does this org distinguish in-house vs external
          // field workers? Gates the employment-type UI + the €9 in-house seat.
          orgUsesExternalWorkers: organization?.usesExternalWorkers ?? false,
          profileBadges: resolveProfileBadges(profileBadges, organization?.profileBadges),
          // Per-user Access Profile overrides the org-wide modules when set.
          enabledModules: (userModules ?? organization?.enabledModules) || [],
          // Org FEATURE modules — always the org's set (drives hasModule/hasFeature).
          orgModules: (organization?.enabledModules as string[] | null) || [],
          spaceModules: await this.tokens.visibleSpaceModules(
            user.id,
            user.organizationId!,
            isAdmin(user as never),
            (organization?.enabledModules as string[] | null) ?? [],
          ),
          // Billing status carried on req.user so the SubscriptionGuard enforces
          // the read-only lock with zero extra DB reads (cached with the user).
          subStatus: organization?.suspendedAt ? 'canceled' : (organization?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
          planTier: organization?.planTier ? organization.planTier.toString().toLowerCase() : null,
          // Bought capabilities — PlanGuard reads ONLY this. It has to be set on
          // every path that builds a request context, including this one: an
          // undefined list is an empty list, and an empty list 402s every
          // premium mutation for that caller.
          orgAddOns: organization?.addOns ?? [],
          orgCurrency: organization?.currency ?? 'EUR',
          offlineMode: organization?.offlineMode ?? false,
          // Org-level portal opt-in (customers only exist when enabled).
          customerPortalEnabled: organization?.customerPortalEnabled ?? false,
        },
      };
    } catch {
      return { valid: false };
    }
  }
}
