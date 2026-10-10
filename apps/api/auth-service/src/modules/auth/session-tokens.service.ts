import {
  readAssignedHome,
  DEFAULT_REFRESH_TOKEN_TTL,
  normalizeRole,
  buildResolvedAccess,
  isAdmin,
  ORG_SUSPENDED_MESSAGE,
  memberAccessOf,
} from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  hashToken,
  resolveProfileBadges,
  orgPermissionFields,
  type AuthResult,
} from './auth-common';

/**
 * Minting a session: the token pair, its expiry, and the request context a
 * signed-in member carries (with the modules their workspaces switch on).
 *
 * Part of authentication; `AuthService` is the facade every caller uses.
 */
@Injectable()
export class SessionTokensService {
  private readonly logger = new Logger(SessionTokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Every feature module switched on in a workspace this member can see.
   *
   * Modules are bought and enabled PER WORKSPACE, so the organization's own list
   * is not the answer: a company that runs Assets on one site has it on that
   * site's row and nowhere else. The navigation needs "is this worth offering at
   * all", and asking it per page would mean loading the workspace list on every
   * screen for every member.
   *
   * So it is answered once, with the session. One bounded query — module names
   * only, from the spaces this member is on (all of them for an admin, whose
   * reach is the organization). The union is a handful of short strings.
   */
  async visibleSpaceModules(
    userId: string,
    organizationId: string,
    isAdminUser: boolean,
    /*
      What a workspace runs when it has never been configured.

      A space's own list overrides the organization's; an ABSENT list inherits
      it — the same precedence the module gates apply. Without the fallback a
      brand-new workspace looks like it runs nothing, and the navigation hides
      features the organization is paying for.
    */
    orgFallback: string[] = [],
  ): Promise<string[]> {
    try {
      const spaces = await this.prisma.companyLocation.findMany({
        where: {
          organizationId,
          isActive: true,
          ...(isAdminUser
            ? {}
            : {
                spaceAssignments: {
                  some: {
                    userId,
                    OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
                  },
                },
              }),
        },
        select: { enabledModules: true },
        take: 200,
      });
      const out = new Set<string>();
      for (const s of spaces) {
        const own = s.enabledModules as string[] | null;
        for (const m of own?.length ? own : orgFallback) out.add(m);
      }
      return [...out];
    } catch {
      // Never fail a login over navigation garnish: an empty list simply means
      // the nav falls back to the organization's own modules.
      return [];
    }
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
    user: any,
    access: any,
    opts: {
      userAgent?: string;
      ipAddress?: string;
      refreshTtl?: string;
      clientPlatform?: string;
    },
  ): Promise<AuthResult> {
    const tokens = await this.generateTokens(user.id, user.email, user.role, user.organizationId, {
      userAgent: opts.userAgent,
    ipAddress: opts.ipAddress,
    }, user.canViewAllTasks, opts.refreshTtl, opts.clientPlatform);

    // Audit: successful login (fire-and-forget, never blocks response)
    if (user.organizationId) {
      this.auditLog.log({
        eventType: 'USER_LOGIN' as any,
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
          subStatus: user.organization?.suspendedAt ? 'canceled' : (user.organization?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
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
        organization: { select: { name: true, timezone: true, profileBadges: true, enabledModules: true, subStatus: true, planTier: true, addOns: true, currency: true, offlineMode: true, usesExternalWorkers: true, suspendedAt: true, ownerId: true } },
        memberRole: { select: { permissions: true, isActive: true } },
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
      return { success: false, statusCode: HttpStatus.UNAUTHORIZED, message: 'Invalid credentials' };
    }
    // The organization off switch bites here too — see isOrganizationSuspended.
    if (user.organization?.suspendedAt) {
      return { success: false, statusCode: HttpStatus.FORBIDDEN, message: ORG_SUSPENDED_MESSAGE };
    }

    const access = memberAccessOf(user);

    return this.buildSession(user, access, opts);
  }

  async generateTokens(userId: string, email: string, role: string, organizationId?: string | null, deviceInfo?: { userAgent?: string; ipAddress?: string }, canViewAllTasks = false, refreshTtl?: string, plat?: string) {
    // organizationId is embedded so downstream services (e.g. the Socket.IO
    // gateway) can scope rooms from the verified token instead of trusting a
    // client-supplied org id.
    const basePayload: Record<string, any> = { sub: userId, email, role };
    if (organizationId) basePayload.organizationId = organizationId;
    // Lets the Socket.IO gateway scope task events to admins + "view all tasks"
    // holders (a room they join) instead of broadcasting to the whole org.
    if (canViewAllTasks) basePayload.canViewAllTasks = true;
    // `plat` = the surface this session was opened from, fixed at login and
    // carried across rotations like `rtl`. Enforcement reads THIS rather than a
    // request header: the claim is signed, so a client cannot drop it to skip
    // the check the way it could simply omit X-Client-Platform.
    if (plat === 'web' || plat === 'mobile') basePayload.plat = plat;

    // Token expiration from environment variables. `refreshTtl` (per-session, from
    // login: web honors rememberMe → 24h/30d; mobile → env default 90d) overrides
    // the env default and is carried forward across rotations via the `rtl` claim.
    const accessExpiration = this.configService.get('JWT_ACCESS_EXPIRATION') || '15m';
    // Typed loose (like accessExpiration, which is any from configService) so the
    // jsonwebtoken `expiresIn` StringValue overload accepts it.
    const refreshExpiration: any = refreshTtl || this.configService.get('JWT_REFRESH_EXPIRATION') || DEFAULT_REFRESH_TOKEN_TTL;

    this.logger.log(`Generating tokens with refreshExpiration=${refreshExpiration}`);

    const accessToken = this.jwtService.sign(
      { ...basePayload, jti: randomUUID() },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiration,
      },
    );

    const refreshToken = this.jwtService.sign(
      // `rtl` = this session's refresh lifetime, so rotation keeps the original
      // policy (web-short vs mobile-90d) instead of resetting to the env default.
      { ...basePayload, jti: randomUUID(), rtl: refreshExpiration },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiration,
      },
    );

    // Calculate expiry based on config (parse duration string)
    const expiresAt = this.calculateExpiry(refreshExpiration);

    // SECURITY: Store only the hash of the refresh token, not the token itself
    const tokenHash = hashToken(refreshToken);

    const created = await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
        userAgent: deviceInfo?.userAgent?.substring(0, 512),
        ipAddress: deviceInfo?.ipAddress?.substring(0, 45),
      },
    });
    // No part of the hash in the log: a prefix narrows a stolen-database search and
    // says nothing an operator needs — the row id identifies the session.
    this.logger.log(`NEW TOKEN CREATED in DB: id=${created.id}, expires=${expiresAt}`);

    // Return the plain token to the client (they need it to authenticate)
    return { accessToken, refreshToken };
  }

  private calculateExpiry(duration: string): Date {
    const now = new Date();
    const match = duration.match(/^(\d+)([smhd])$/);

    if (!match) {
      // Default to 7 days if invalid format
      now.setDate(now.getDate() + 7);
      return now;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        now.setSeconds(now.getSeconds() + value);
        break;
      case 'm':
        now.setMinutes(now.getMinutes() + value);
        break;
      case 'h':
        now.setHours(now.getHours() + value);
        break;
      case 'd':
        now.setDate(now.getDate() + value);
        break;
    }

    return now;
  }
}
