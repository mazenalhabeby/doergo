import {
  MAX_SESSIONS_PER_USER,
  MAX_FAILED_ATTEMPTS,
  BCRYPT_COST_FACTOR,
  DEFAULT_PERMISSIONS,
  DEFAULT_ORG_MODULES,
  Role,
  buildResolvedAccess,
  canUsePlatform,
  isOrganizationSuspended,
  ORG_SUSPENDED_MESSAGE,
  ORG_SUSPENDED_CODE,
  LOGIN_FAILED_MESSAGE,
  isLockActive,
  nextLockStateAfterFailure,
  maskEmail,
  normalizeEmail,
} from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { seedDefaultWorkflow } from '../../common/seed-default-workflow';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';
import * as bcrypt from 'bcryptjs';
import { dummyPasswordHash, ignoreLegacyFlags, type AuthResult } from './auth-common';
import { SessionTokensService } from './session-tokens.service';

/**
 * The two ways in: registering a new organization owner, and signing in.
 *
 * Part of authentication; `AuthService` is the facade every caller uses.
 */
@Injectable()
export class SignInService {
  private readonly logger = new Logger(SignInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly billing: BillingService,
    private readonly tokens: SessionTokensService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    companyName?: string;
    firstSpaceName?: string;
  }) {
    try {
      // Sanitize inputs: email to lowercase, names preserve case (capitalized by DTO)
      const email = normalizeEmail(data.email);
      const firstName = data.firstName.trim();
      const lastName = data.lastName.trim();
      const companyName = data.companyName?.trim();
      // SECURITY: Force role to ADMIN regardless of input (self-registered users are admins of their org)
      const role = Role.ADMIN;
      // Get default permissions for the role
      const defaultPerms = DEFAULT_PERMISSIONS[role];

      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'An account with this email already exists',
        };
      }

      // Use higher bcrypt cost factor (12) for better security
      const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);

      // Determine if this is a full registration (with org) or orphan user (onboarding later)
      const hasCompanyName = !!companyName;

      if (hasCompanyName) {
        // Full registration: create org + user in a transaction
        const result = await this.prisma.$transaction(async (tx) => {
          const organization = await tx.organization.create({
            data: {
              name: companyName,
              isActive: true,
              enabledModules: DEFAULT_ORG_MODULES,
            },
          });

          // The org's first space is created in the dedicated "Set up your first
          // space" onboarding step (so it can have a type, address & map pin) —
          // not here. The org starts with no space.

          // Seed the org's default task type (Field Service) so Task Types isn't
          // empty and new tasks have a capability-rich flow out of the box.
          await seedDefaultWorkflow(tx, organization.id);

          const newUser = await tx.user.create({
            data: {
              email,
              passwordHash,
              firstName,
              lastName,
              role,
              organizationId: organization.id,
              onboardingCompleted: true,
              failedLoginAttempts: 0,
              lockedUntil: null,

              canCreateTasks: defaultPerms.canCreateTasks,
              taskCreationScope: defaultPerms.taskCreationScope,
              canViewAllTasks: defaultPerms.canViewAllTasks,
              canAssignTasks: defaultPerms.canAssignTasks,
              canManageUsers: defaultPerms.canManageUsers,
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              organizationId: true,
              onboardingCompleted: true,
              // Works for a client or partner — see the same field on the
              // validateToken select. Both session payloads must carry it or
              // the badge changes meaning depending which one built the user.
              isExternal: true,
              avatarUrl: true,

              canCreateTasks: true,
              taskCreationScope: true,
              canViewAllTasks: true,
              canAssignTasks: true,
              canManageUsers: true,
              createdAt: true,
            },
          });

          return newUser;
        });

        // Start the 14-day Professional trial (sets planTier/subStatus/trialEndsAt
        // + Subscription row). Without this a full web signup lands with
        // planTier=null and every premium feature 402s. Non-fatal — a billing
        // hiccup must not block registration.
        if (result.organizationId) {
          try {
            await this.billing.startTrial(result.organizationId);
          } catch (e) {
            this.logger.warn(
              `startTrial failed for org ${result.organizationId}: ${(e as Error).message}`,
            );
          }
        }

        return { success: true, data: result };
      } else {
        // Orphan user: no org, onboarding required
        const user = await this.prisma.user.create({
          data: {
            email,
            passwordHash,
            firstName,
            lastName,
            role,
            onboardingCompleted: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
            canCreateTasks: defaultPerms.canCreateTasks,
            taskCreationScope: defaultPerms.taskCreationScope,
            canViewAllTasks: defaultPerms.canViewAllTasks,
            canAssignTasks: defaultPerms.canAssignTasks,
            canManageUsers: defaultPerms.canManageUsers,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            organizationId: true,
            onboardingCompleted: true,
            canCreateTasks: true,
            taskCreationScope: true,
            canViewAllTasks: true,
            canAssignTasks: true,
            canManageUsers: true,
            createdAt: true,
          },
        });

        return { success: true, data: user };
      }
    } catch (error) {
      this.logger.error('Registration error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to create account. Please try again.',
      };
    }
  }

  async login(data: { email: string; password: string; rememberMe?: boolean; client?: string; clientPlatform?: string; userAgent?: string; ipAddress?: string }): Promise<AuthResult> {
    try {
      // Normalize email to lowercase for lookup
      const email = normalizeEmail(data.email);

      const user = await this.prisma.user.findUnique({
        where: { email },
        include: {
          organization: { select: { name: true, timezone: true, profileBadges: true, enabledModules: true, subStatus: true, planTier: true, addOns: true, currency: true, offlineMode: true, usesExternalWorkers: true, suspendedAt: true, ownerId: true } },
          // Unified roles (Phase 2) → resolved `access` on the login response.
          // isActive so a deactivated role stops granting (M1). Space grants are
          // filtered to their effective window so expired/future grants don't
          // contribute per-space permissions (L2).
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

      /*
        ONE refusal for every way a sign-in can fail.

        Unknown address, wrong password and a locked account all answer the
        same 401 with the same sentence, and all of them spend one bcrypt
        comparison. Before this an unknown address returned in a millisecond
        while a real one took ~250ms, a real one counted down "N attempt(s)
        remaining", and a locked one answered 429 — three separate ways to ask
        "does this person have an account here?".
      */
      const refused = {
        success: false as const,
        statusCode: HttpStatus.UNAUTHORIZED,
        message: LOGIN_FAILED_MESSAGE,
      };

      if (!user || !user.isActive) {
        await bcrypt.compare(data.password, await dummyPasswordHash());
        return refused;
      }

      // SECURITY: a locked account is refused even with the right password —
      // otherwise the lock would cost an attacker nothing. Same answer, same cost.
      if (isLockActive(user)) {
        await bcrypt.compare(data.password, user.passwordHash);
        return refused;
      }

      const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

      if (!isPasswordValid) {
        // SECURITY: count the failure. An EXPIRED lock starts the count again
        // (see nextLockStateAfterFailure) — so a lock is a fifteen-minute window,
        // never a permanent lock-out one wrong guess at a time.
        const next = nextLockStateAfterFailure(user);
        if (next.lockedUntil) {
          this.logger.warn(`Account locked for ${maskEmail(email)} after ${next.failedLoginAttempts} failed attempts`);
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: next,
        });

        // Audit: failed login
        if (user.organizationId) {
          this.auditLog.log({
            eventType: 'USER_LOGIN_FAILED',
            userId: user.id,
            organizationId: user.organizationId,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            metadata: { email, attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - next.failedLoginAttempts) },
          });
        }

        return refused;
      }

      /*
        Access Profile: Web / Mobile / Both.

        Checked HERE, after the password has been verified — refusing earlier
        would answer "does this account exist?" for anyone probing, which the
        rest of this method is careful not to do.

        Clients name themselves with X-Client-Platform. One that says nothing is
        allowed through: mobile builds already in the field do not send it yet.
      */
      /*
        Is the whole organization switched off?

        Also after the password, for the reason above — a suspended org's member
        list must not be discoverable by anyone who can guess an email. The
        operator sets this on admin.hbcfield.com; see `isOrganizationSuspended`
        for why it now means "off" rather than "read-only".
      */
      if (isOrganizationSuspended(user.organization)) {
        this.logger.warn(`[SUSPENDED] Sign-in refused for ${maskEmail(email)} — organization ${user.organizationId} is deactivated`);
        return {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          message: ORG_SUSPENDED_MESSAGE,
          code: ORG_SUSPENDED_CODE,
        };
      }

      const clientPlatform = String((data as any).clientPlatform ?? '').toLowerCase().trim();
      if (
        (clientPlatform === 'web' || clientPlatform === 'mobile') &&
        !canUsePlatform(user as any, clientPlatform)
      ) {
        return {
          success: false,
          statusCode: HttpStatus.FORBIDDEN,
          message:
            clientPlatform === 'web'
              ? 'This account is set up for the mobile app. Ask an admin to allow web access.'
              : 'This account is set up for the web app. Ask an admin to allow mobile access.',
        };
      }

      // Every successful login starts the session as Available; the user can
      // change it to Busy/Away later. Also reset any failed-attempt lockout.
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          presence: 'AVAILABLE',
          // Mark active immediately so the user reads as online the moment they
          // sign in (don't wait for the first token-validation ping).
          lastActiveAt: new Date(),
          ...(user.failedLoginAttempts > 0 || user.lockedUntil
            ? { failedLoginAttempts: 0, lockedUntil: null }
            : {}),
        },
      });
      user.presence = 'AVAILABLE'; // reflect in the login response below

      // Clean up expired tokens for this user
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId: user.id,
          expiresAt: { lt: new Date() },
        },
      });

      // Enforce max sessions: keep only the newest (MAX_SESSIONS_PER_USER - 1) tokens
      // so after creating a new one, total will be MAX_SESSIONS_PER_USER
      const existingTokens = await this.prisma.refreshToken.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (existingTokens.length >= MAX_SESSIONS_PER_USER) {
        const tokensToDelete = existingTokens.slice(MAX_SESSIONS_PER_USER - 1);
        await this.prisma.refreshToken.deleteMany({
          where: {
            id: { in: tokensToDelete.map((t) => t.id) },
          },
        });
      }

      // Session lifetime by client: WEB honors rememberMe (30d) vs a short
      // session (24h) on shared machines; MOBILE (or an unknown/legacy client
      // that sends nothing) keeps the env default (90d) so app users stay signed
      // in. Defaulting absent→mobile preserves existing mobile builds.
      const refreshTtl =
        data.client === 'web' ? (data.rememberMe ? '30d' : '24h') : undefined;

      /*
        Resolve access ONCE for this response.

        The same switch as validateToken — see the note on ignoreLegacyFlags.
        Both must agree, or a member is handed permissions at sign-in that
        vanish on their very next request.
      */
      const loginAccess = buildResolvedAccess({
        // An admin holds everything by being one — see buildResolvedAccess.
        isAdmin: user.role === Role.ADMIN,
        userFlags: ignoreLegacyFlags()
          ? undefined
          : {
              canCreateTasks: user.canCreateTasks,
              canViewAllTasks: user.canViewAllTasks,
              canAssignTasks: user.canAssignTasks,
              canManageUsers: user.canManageUsers,
              canViewReports: user.canViewReports,
            },
        memberRolePermissions: user.memberRole?.isActive ? user.memberRole.permissions : undefined,
        spaces: user.spaceAssignments.map((a) => ({
          spaceId: a.spaceId,
          permissions: a.role?.isActive ? a.role.permissions : undefined,
        })),
      });

      return this.tokens.buildSession(user, loginAccess, {
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        refreshTtl,
        clientPlatform,
      });

    } catch (error) {
      this.logger.error('Login error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Login failed. Please try again.',
      };
    }
  }
}
