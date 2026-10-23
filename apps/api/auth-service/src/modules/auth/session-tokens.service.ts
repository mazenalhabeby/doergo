import { sessionAccess } from './stand-in';
import {
  activeWindowWhere,
  readAssignedHome,
  normalizeRole,
  isAdmin,
  ORG_SUSPENDED_MESSAGE,
  memberAccessOf,
  parseClockInPick,
  PrismaService,
} from '@hbcfield/shared';
import { Injectable, HttpStatus } from '@nestjs/common';
import { resolveProfileBadges, orgPermissionFields, type AuthResult } from './auth-common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TokenPairService } from './token-pair.service';
import { visibleSpaceModules } from './session-modules';
import type { Organization, User } from '@prisma/client';
import type { ResolvedAccess } from '@hbcfield/shared';

/** Exactly what a session is built from: the member's columns and their organization's. */
type SessionUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'role'
  | 'organizationId'
  | 'onboardingCompleted'
  | 'isExternal'
  | 'avatarUrl'
  | 'allowRemote'
  | 'canCreateTasks'
  | 'taskCreationScope'
  | 'clockInPick'
  | 'enabledModules'
  | 'guidesSeen'
  | 'position'
  | 'presence'
  | 'profileBadges'
  | 'scheduleType'
  | 'specialty'
  | 'timeFormat'
  | 'canViewAllTasks'
  | 'memberRoleId'
  | 'assignedHome'
> & {
  organization?: Pick<
    Organization,
    | 'name'
    | 'timezone'
    | 'profileBadges'
    | 'enabledModules'
    | 'subStatus'
    | 'planTier'
    | 'addOns'
    | 'currency'
    | 'offlineMode'
    | 'usesExternalWorkers'
    | 'suspendedAt'
    | 'ownerId'
  > | null;
};

/**
 * Minting a session: the token pair, its expiry, and the request context a
 * signed-in member carries (with the modules their workspaces switch on).
 *
 * Part of authentication; `AuthService` is the facade every caller uses.
 */
@Injectable()
export class SessionTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly tokenPair: TokenPairService,
  ) {}

  /** Every feature module switched on in a workspace this member can see (see session-modules). */
  visibleSpaceModules(userId: string, organizationId: string, isAdminUser: boolean, orgFallback: string[] = []) {
    return visibleSpaceModules(this.prisma, userId, organizationId, isAdminUser, orgFallback);
  }

  /** The token pair for a session (see TokenPairService) — login, refresh and biometric sign-in all mint here. */
  generateTokens(...args: Parameters<TokenPairService['generateTokens']>) {
    return this.tokenPair.generateTokens(...args);
  }

  /*
    Everything after "this is definitely the member" — resolved access, the
    tokens, and the payload the client is built against.

    ⚠️ Extracted from `login()` so biometric sign-in mints an IDENTICAL session.
    Two hand-written copies of a 70-line auth payload is how one path quietly
    grants a permission the other does not, and the symptom is a member whose
    screens differ depending on how they signed in that morning. There is one
    copy, and both doors call it.
  */
  async buildSession(
    user: SessionUser,
    access: ResolvedAccess,
    opts: {
      userAgent?: string;
      ipAddress?: string;
      refreshTtl?: string;
      clientPlatform?: string;
    },
  ): Promise<AuthResult> {
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.organizationId,
      {
        userAgent: opts.userAgent,
        ipAddress: opts.ipAddress,
      },
      user.canViewAllTasks,
      opts.refreshTtl,
      opts.clientPlatform,
    );

    // Audit: successful login (fire-and-forget, never blocks response)
    if (user.organizationId) {
      this.auditLog.log({
        eventType: 'USER_LOGIN',
        userId: user.id,
        organizationId: user.organizationId as string,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
      });
    }

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: normalizeRole(user.role),
          organizationId: user.organizationId,
          organizationName: user.organization?.name || null,
          // Owner of this organization? Read here so the client never asks:
          // it labels the owner and hides actions that would be refused.
          isOwner: !!user.organization?.ownerId && user.organization.ownerId === user.id,
          organizationTimezone: user.organization?.timezone || null,
          orgUsesExternalWorkers: user.organization?.usesExternalWorkers ?? false,
          onboardingCompleted: user.onboardingCompleted,
          // Works for a client or partner. The phone hides what external
          // members may never use (the client book, equipment, the route);
          // without it a fresh login and a restored session disagree.
          isExternal: user.isExternal ?? false,
          avatarUrl: user.avatarUrl,
          // Permission fields come from resolved access, below — the client
          // gates its own UI on them (useTaskPermissions reads
          // user.canCreateTasks), so they must be the same answer the server
          // will give, not the raw columns.
          // taskCreationScope comes from orgPermissionFields below, reconciled
          // with the grant — the raw column disagreed with it.
          allowRemote: user.allowRemote,
          presence: user.presence,
          // Worker configuration
          position: user.position,
          scheduleType: user.scheduleType,
          // Technician-specific fields
          specialty: user.specialty,
          // Profile badge visibility
          profileBadges: resolveProfileBadges(user.profileBadges, user.organization?.profileBadges),
          // Per-user clock display preference ("24h" | "12h") — display-only.
          timeFormat: user.timeFormat ?? '24h',
          // Several workspaces: clock in where they stand, or always choose.
          clockInPick: parseClockInPick(user.clockInPick),
          // One-time welcome-tour flag (false = auto-run the welcome guide once).
          guidesSeen: user.guidesSeen ?? false,
          // Access Profile (mobile tabs / web screens) — per-user overrides org.
          enabledModules: (user.enabledModules ?? user.organization?.enabledModules) || [],
          // Org FEATURE modules (sprints, checklists, tracking…) — always the
          // org's set, never the user's access profile. Drives hasModule/hasFeature.
          orgModules: (user.organization?.enabledModules as string[] | null) || [],
          // Modules switched on in workspaces this member can see — see
          // visibleSpaceModules. Drives which top-level nav entries exist.
          spaceModules: await this.visibleSpaceModules(
            user.id,
            user.organizationId!,
            isAdmin(user as never),
            (user.organization?.enabledModules as string[] | null) ?? [],
          ),
          // Billing tier + subscription status (lowercase) — drives plan gating.
          subStatus: user.organization?.suspendedAt
            ? 'canceled'
            : (user.organization?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
          planTier: user.organization?.planTier ? user.organization.planTier.toString().toLowerCase() : null,
          // Capabilities the org has BOUGHT — the only thing PlanGuard reads.
          // Resolved here, server-side, so it can never be a client claim.
          orgAddOns: user.organization?.addOns ?? [],
          // What the organization pays in — costs, statements, margins (shared billing/currency.ts).
          orgCurrency: user.organization?.currency ?? 'EUR',
          // The offline-first app, switched on per organization (rollout).
          offlineMode: user.organization?.offlineMode ?? false,
          // Unified resolved access (Phase 2): org-wide ∪ per-space grants.
          access: access,
          // …and the permission fields derived from it, so what the client
          // gates its UI on is what the server will authorize. Last, to win
          // over the individual fields set above.
          ...orgPermissionFields(access, user.taskCreationScope),
          // See validateToken: a document type may name the roles that see it.
          memberRoleId: user.memberRoleId ?? null,
          // A home screen the office set up; the phone applies it once.
          assignedHome: readAssignedHome(user.assignedHome),
        },
        ...tokens,
      },
    };
  }

  /**
   * A session for a member who has ALREADY been authenticated by other means —
   * today, a signature from a key bound to their phone.
   *
   * ⚠️ It authenticates nobody. The caller must have proved identity first;
   * this only loads the member the same way `login()` does and hands the same
   * payload back. Calling it from anywhere that has not verified a credential
   * is an account-takeover bug, not a login bug.
   *
   * The user query mirrors login's exactly, because `buildResolvedAccess` reads
   * `memberRole` and the time-windowed `spaceAssignments` — load a thinner user
   * and the member silently signs in with fewer permissions than they hold.
   */
  async buildSessionForUser(
    userId: string,
    opts: { userAgent?: string; ipAddress?: string; clientPlatform?: string },
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: {
            name: true,
            timezone: true,
            profileBadges: true,
            enabledModules: true,
            subStatus: true,
            planTier: true,
            addOns: true,
            currency: true,
            offlineMode: true,
            usesExternalWorkers: true,
            suspendedAt: true,
            ownerId: true,
          },
        },
        memberRole: { select: { permissions: true, isActive: true } },
        spaceAssignments: {
          where: {
            ...activeWindowWhere(),
          },
          select: { spaceId: true, role: { select: { permissions: true, isActive: true } } },
        },
      },
    });
    if (!user || !user.isActive) {
      return { success: false, statusCode: HttpStatus.UNAUTHORIZED, message: 'Invalid credentials' };
    }
    // The organization off switch bites here too — see isOrganizationSuspended.
    if (user.organization?.suspendedAt) {
      return { success: false, statusCode: HttpStatus.FORBIDDEN, message: ORG_SUSPENDED_MESSAGE };
    }

    const access = await sessionAccess(this.prisma, user, user.organization?.timezone, memberAccessOf(user));

    return this.buildSession(user, access, opts);
  }
}
