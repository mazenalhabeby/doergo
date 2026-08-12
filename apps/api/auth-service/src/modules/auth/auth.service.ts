import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { seedDefaultWorkflow } from '../../common/seed-default-workflow';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BillingService } from '../billing/billing.service';
import { GraceTokenCache } from './grace-token-cache.service';
import {
  MAX_SESSIONS_PER_USER,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  PASSWORD_RESET_EXPIRATION_HOURS,
  REFRESH_TOKEN_GRACE_PERIOD_SECONDS,
  BCRYPT_COST_FACTOR,
  success,
  error,
  ErrorCodes,
  DEFAULT_PERMISSIONS,
  DEFAULT_PROFILE_BADGES,
  DEFAULT_ORG_MODULES,
  Role,
  normalizeRole,
  buildResolvedAccess,
  type ProfileBadgesConfig,
} from '@hbcfield/shared';

// Hash a token using SHA-256 for secure storage
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Resolve profile badges: user override > org config > defaults
function resolveProfileBadges(
  userBadges: any,
  orgBadges: any,
): ProfileBadgesConfig {
  const base = { ...DEFAULT_PROFILE_BADGES };
  // Apply org-level config
  if (orgBadges && typeof orgBadges === 'object') {
    Object.assign(base, orgBadges);
  }
  // Apply user-level override
  if (userBadges && typeof userBadges === 'object') {
    Object.assign(base, userBadges);
  }
  return base;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private mailTransporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLog: AuditLogService,
    private readonly billing: BillingService,
    private readonly graceCache: GraceTokenCache,
  ) {
    const smtpHost = this.configService.get('SMTP_HOST');
    if (smtpHost) {
      this.mailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: this.configService.get('SMTP_PORT', 587),
        secure: false,
        auth: {
          user: this.configService.get('SMTP_USER'),
          pass: this.configService.get('SMTP_PASS'),
        },
      });
      this.logger.log('SMTP transporter configured');
    } else {
      this.logger.warn('SMTP not configured - password reset emails will not be sent');
    }
  }

  private async sendPasswordResetEmail(email: string, firstName: string, resetToken: string) {
    if (!this.mailTransporter) {
      this.logger.warn('Cannot send password reset email - SMTP not configured');
      return;
    }

    const appUrl = this.configService.get('APP_URL', 'https://hbcfield.hbc-solution.io');
    const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
    const fromEmail = this.configService.get('SMTP_FROM', 'noreply@hbcfield.eu');

    try {
      await this.mailTransporter.sendMail({
        from: fromEmail,
        to: email,
        subject: 'HBCField - Reset Your Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Password Reset Request</h2>
            <p>Hello ${firstName},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Reset Password
              </a>
            </div>
            <p style="color: #64748b; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="color: #64748b; font-size: 14px; word-break: break-all;">${resetLink}</p>
            <p style="color: #64748b; font-size: 14px;">This link will expire in ${PASSWORD_RESET_EXPIRATION_HOURS} hour(s).</p>
            <p style="color: #64748b; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 12px;">This is an automated message from HBCField.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${email}: ${err}`);
    }
  }

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
      const email = data.email.trim().toLowerCase();
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

  async login(data: { email: string; password: string; rememberMe?: boolean; client?: string; userAgent?: string; ipAddress?: string }) {
    try {
      // Normalize email to lowercase for lookup
      const email = data.email.trim().toLowerCase();

      const user = await this.prisma.user.findUnique({
        where: { email },
        include: {
          organization: { select: { name: true, timezone: true, profileBadges: true, enabledModules: true, subStatus: true, planTier: true, usesExternalWorkers: true } },
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

      if (!user || !user.isActive) {
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid email or password',
        };
      }

      // SECURITY: Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMinutes = Math.ceil(
          (user.lockedUntil.getTime() - Date.now()) / 60000,
        );
        return {
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Account temporarily locked. Try again in ${remainingMinutes} minute(s).`,
        };
      }

      const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

      if (!isPasswordValid) {
        // SECURITY: Increment failed attempts
        const newFailedAttempts = user.failedLoginAttempts + 1;
        const updateData: any = { failedLoginAttempts: newFailedAttempts };

        // Lock account after MAX_FAILED_ATTEMPTS
        if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
          updateData.lockedUntil = new Date(
            Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
          );
          this.logger.warn(`Account locked for user: ${email} after ${newFailedAttempts} failed attempts`);
        }

        await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });

        // Audit: failed login
        if (user.organizationId) {
          this.auditLog.log({
            eventType: 'USER_LOGIN_FAILED',
            userId: user.id,
            organizationId: user.organizationId,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            metadata: { email, attemptsRemaining: MAX_FAILED_ATTEMPTS - newFailedAttempts },
          });
        }

        const attemptsRemaining = MAX_FAILED_ATTEMPTS - newFailedAttempts;
        if (attemptsRemaining > 0) {
          return {
            success: false,
            statusCode: HttpStatus.UNAUTHORIZED,
            message: `Invalid email or password. ${attemptsRemaining} attempt(s) remaining.`,
          };
        }

        return {
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Account locked for ${LOCKOUT_DURATION_MINUTES} minutes due to too many failed attempts.`,
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

      const tokens = await this.generateTokens(user.id, user.email, user.role, user.organizationId, {
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
      }, user.canViewAllTasks, refreshTtl);

      // Audit: successful login (fire-and-forget, never blocks response)
      if (user.organizationId) {
        this.auditLog.log({
          eventType: 'USER_LOGIN' as any,
          userId: user.id,
          organizationId: user.organizationId as string,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
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
            organizationTimezone: user.organization?.timezone || null,
            orgUsesExternalWorkers: user.organization?.usesExternalWorkers ?? false,
            onboardingCompleted: user.onboardingCompleted,
            avatarUrl: user.avatarUrl,
            // Permission fields
            canCreateTasks: user.canCreateTasks,
            taskCreationScope: user.taskCreationScope,
            canViewAllTasks: user.canViewAllTasks,
            canAssignTasks: user.canAssignTasks,
            canManageUsers: user.canManageUsers,
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
            // Billing tier + subscription status (lowercase) — drives plan gating.
            subStatus: (user.organization?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
            planTier: user.organization?.planTier ? user.organization.planTier.toString().toLowerCase() : null,
            // Unified resolved access (Phase 2): org-wide ∪ per-space grants.
            access: buildResolvedAccess({
              userFlags: {
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
            }),
          },
          ...tokens,
        },
      };

    } catch (error) {
      this.logger.error('Login error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Login failed. Please try again.',
      };
    }
  }

  async refresh(refreshToken: string) {
    try {
      this.logger.log('Refresh attempt started');

      if (!refreshToken) {
        this.logger.warn('Refresh called with empty token');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Refresh token is required',
        };
      }

      // SECURITY: Hash the incoming token to compare with stored hash
      const tokenHash = hashToken(refreshToken);

      // Carry the session's refresh lifetime across rotation. Older tokens issued
      // before this change have no `rtl` claim → undefined → env default (90d).
      let refreshTtl: string | undefined;
      try {
        const decoded = this.jwtService.decode(refreshToken) as { rtl?: string } | null;
        if (decoded?.rtl) refreshTtl = decoded.rtl;
      } catch {
        /* malformed token is handled by the hash lookup below */
      }

      // Find the stored token by hash
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              organization: { select: { name: true, timezone: true, profileBadges: true, enabledModules: true, subStatus: true, planTier: true, usesExternalWorkers: true } },
            },
          },
        },
      });

      if (!storedToken) {
        this.logger.warn('Refresh token not found in database');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid refresh token',
        };
      }

      this.logger.log(`Found token for user: ${storedToken.user.email}, token ID: ${storedToken.id}`);
      this.logger.log(`Token expires at: ${storedToken.expiresAt}, now: ${new Date()}`);

      if (storedToken.expiresAt < new Date()) {
        this.logger.warn('Refresh token expired');
        // Clean up expired token
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Refresh token expired',
        };
      }

      // Check if user is still active
      if (!storedToken.user.isActive) {
        this.logger.warn('User account is deactivated');
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Account is deactivated',
        };
      }

      // ========== GRACE PERIOD HANDLING ==========
      // If token was already used, check if we're within the grace period
      if (storedToken.usedAt) {
        const gracePeriodEnd = new Date(storedToken.usedAt.getTime() + REFRESH_TOKEN_GRACE_PERIOD_SECONDS * 1000);
        const now = new Date();

        if (now > gracePeriodEnd) {
          // Beyond grace period → this is a rotated token being replayed, a strong
          // signal the token was stolen. Revoke the user's ENTIRE refresh-token
          // chain so the attacker (and the victim) are forced to re-authenticate,
          // and record a security event (L9).
          this.logger.warn(
            `[SECURITY] Refresh-token reuse detected for user ${storedToken.userId} ` +
            `(token used at ${storedToken.usedAt}, grace expired). Revoking token chain.`,
          );
          await this.prisma.refreshToken
            .deleteMany({ where: { userId: storedToken.userId } })
            .catch((e) => this.logger.error('Failed to revoke token chain on reuse', e));
          return {
            success: false,
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Token already used',
          };
        }

        // Within grace period - check the Redis grace cache or wait for it (H7).
        const graceHit = await this.graceCache.get(storedToken.id);
        if (graceHit) {
          this.logger.log(`Token reuse within grace period (${REFRESH_TOKEN_GRACE_PERIOD_SECONDS}s). Returning cached tokens.`);
          return { success: true, data: graceHit };
        }

        // Within grace period but no cached tokens yet - another request is generating them
        // Wait and retry to get the cached tokens (exponential backoff: 50, 100, 200, 400, 800ms)
        this.logger.log('Token used but cached tokens not ready - waiting for concurrent request to finish');
        for (let attempt = 0; attempt < 5; attempt++) {
          const delay = 50 * Math.pow(2, attempt); // 50, 100, 200, 400, 800ms
          await new Promise(resolve => setTimeout(resolve, delay));

          const graceRetry = await this.graceCache.get(storedToken.id);
          if (graceRetry) {
            this.logger.log(`Got cached tokens from concurrent request (attempt ${attempt + 1}, ${delay}ms)`);
            return { success: true, data: graceRetry };
          }
          this.logger.debug(`Waiting for cached tokens, attempt ${attempt + 1}/5 (${delay}ms)`);
        }

        // After waiting, still no cached tokens - give up
        this.logger.warn('Cached tokens not available after waiting');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Token already used',
        };
      }

      // ========== FIRST USE OF TOKEN ==========
      // Use atomic update to prevent race conditions
      // Only mark as used if usedAt is still null (no other request processed it)
      this.logger.log('First use of token - attempting atomic claim');

      const claimResult = await this.prisma.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          usedAt: null,  // Only update if not already used (atomic check)
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (claimResult.count === 0) {
        // Another request already claimed this token - wait for cached tokens
        this.logger.log('Token was claimed by another request - waiting for cached tokens');

        // Retry with exponential backoff to wait for the other request to finish (50, 100, 200, 400ms)
        for (let attempt = 0; attempt < 4; attempt++) {
          const delay = 50 * Math.pow(2, attempt); // 50, 100, 200, 400ms
          await new Promise(resolve => setTimeout(resolve, delay));

          const graceRetry = await this.graceCache.get(storedToken.id);
          if (graceRetry) {
            this.logger.log(`Returning cached tokens from concurrent request (attempt ${attempt + 1}, ${delay}ms)`);
            return { success: true, data: graceRetry };
          }

          this.logger.debug(`Cached tokens not ready yet, attempt ${attempt + 1}/4 (${delay}ms)`);
        }

        // After retries, still no cached tokens - give up
        this.logger.warn('Token claimed but no cached tokens after retries');
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Token already used',
        };
      }

      // We successfully claimed the token - now generate new tokens
      this.logger.log('Token claimed successfully - generating new tokens');

      const tokens = await this.generateTokens(
        storedToken.user.id,
        storedToken.user.email,
        storedToken.user.role,
        storedToken.user.organizationId,
        undefined,
        storedToken.user.canViewAllTasks,
        refreshTtl,
      );

      // Find the new refresh token hash (it was just created by generateTokens)
      const newRefreshTokenHash = hashToken(tokens.refreshToken);

      // Publish the rotated pair to the Redis grace cache (TTL = grace window) so
      // concurrent refreshes within the window get the SAME new tokens — instead
      // of persisting them in the clear in the DB for up to ~15 min. (H7)
      await this.graceCache.put(storedToken.id, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });

      // Record the replacement hash for reuse-detection (stays in the DB).
      // Use updateMany to avoid throwing if the record was somehow deleted.
      const updateResult = await this.prisma.refreshToken.updateMany({
        where: { id: storedToken.id },
        data: {
          replacedByTokenHash: newRefreshTokenHash,
        },
      });

      if (updateResult.count === 0) {
        // Token was deleted between claim and update - this shouldn't happen
        // But we already created the new token, so just return success
        this.logger.warn('Token record disappeared after claim - but new tokens were created, returning success');
      } else {
        this.logger.log('Refresh successful - token marked as used with grace period');

        // Old token cleanup is handled durably by the cleanupExpiredTokens cron
        // (deletes used tokens past the grace window). An in-process setTimeout
        // was previously used but is lost on restart/crash, orphaning rows.
      }

      return {
        success: true,
        data: {
          ...tokens,
          user: {
            id: storedToken.user.id,
            email: storedToken.user.email,
            firstName: storedToken.user.firstName,
            lastName: storedToken.user.lastName,
            role: normalizeRole(storedToken.user.role),
            organizationId: storedToken.user.organizationId,
            onboardingCompleted: storedToken.user.onboardingCompleted,
            avatarUrl: storedToken.user.avatarUrl,
            canCreateTasks: storedToken.user.canCreateTasks,
            taskCreationScope: storedToken.user.taskCreationScope,
            canViewAllTasks: storedToken.user.canViewAllTasks,
            canAssignTasks: storedToken.user.canAssignTasks,
            canManageUsers: storedToken.user.canManageUsers,
            allowRemote: storedToken.user.allowRemote,
            presence: storedToken.user.presence,
            specialty: storedToken.user.specialty,
            profileBadges: resolveProfileBadges(storedToken.user.profileBadges, storedToken.user.organization?.profileBadges),
            enabledModules: (storedToken.user.enabledModules ?? storedToken.user.organization?.enabledModules) || [],
            orgModules: (storedToken.user.organization?.enabledModules as string[] | null) || [],
            subStatus: (storedToken.user.organization?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
            planTier: storedToken.user.organization?.planTier ? storedToken.user.organization.planTier.toString().toLowerCase() : null,
          },
        },
      };
    } catch (error) {
      this.logger.error('Refresh token error:', error);
      this.logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to refresh token',
      };
    }
  }

  async logout(refreshToken: string) {
    try {
      // SECURITY: Hash the token to find and delete
      const tokenHash = hashToken(refreshToken);

      // Look up the owner so we can mark them offline + let the gateway notify
      // teammates in real time.
      const stored = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true, user: { select: { organizationId: true } } },
      });

      await this.prisma.refreshToken.deleteMany({
        where: { tokenHash },
      });

      if (stored?.userId) {
        // Clear last-active so the user reads as offline immediately (no 3-min
        // lag). If they're still active on another device, their next request
        // re-sets it within ~a minute.
        await this.prisma.user
          .update({ where: { id: stored.userId }, data: { lastActiveAt: null } })
          .catch(() => undefined);
      }

      return {
        success: true,
        message: 'Logged out successfully',
        userId: stored?.userId,
        organizationId: stored?.user?.organizationId,
      };
    } catch (error) {
      this.logger.error('Logout error:', error);
      return { success: true, message: 'Logged out successfully' };
    }
  }

  async forgotPassword(data: { email: string }) {
    try {
      // Normalize email
      const email = data.email.trim().toLowerCase();

      // Find user - but don't reveal if email exists (security best practice)
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, firstName: true },
      });

      // SECURITY: Always return success to prevent email enumeration attacks
      const successResponse = {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      };

      if (!user) {
        // Log attempt but return success to prevent enumeration
        this.logger.log(`Password reset requested for non-existent email: ${email}`);
        return successResponse;
      }

      // Delete any existing unused tokens for this user
      await this.prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          used: false,
        },
      });

      // Generate a secure random token
      const resetToken = randomUUID() + randomUUID(); // Extra entropy
      const tokenHash = hashToken(resetToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRATION_HOURS * 60 * 60 * 1000);

      // Store the hashed token
      await this.prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      // Send password reset email
      await this.sendPasswordResetEmail(user.email, user.firstName, resetToken);
      this.logger.log(`Password reset token generated for user: ${email}`);

      return successResponse;
    } catch (error) {
      this.logger.error('Forgot password error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to process password reset request. Please try again.',
      };
    }
  }

  async resetPassword(data: { token: string; newPassword: string }) {
    try {
      // Hash the incoming token to find in database
      const tokenHash = hashToken(data.token);

      // Find the token
      const resetToken = await this.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!resetToken) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid or expired password reset link.',
        };
      }

      // Check if token is expired
      if (resetToken.expiresAt < new Date()) {
        // Clean up expired token
        await this.prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Password reset link has expired. Please request a new one.',
        };
      }

      // Check if token was already used
      if (resetToken.used) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This password reset link has already been used.',
        };
      }

      // Validate new password length
      if (data.newPassword.length < 8) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Password must be at least 8 characters long.',
        };
      }

      // Hash new password with high cost factor
      const newPasswordHash = await bcrypt.hash(data.newPassword, 12);

      // Update user's password and reset failed attempts
      await this.prisma.user.update({
        where: { id: resetToken.user.id },
        data: {
          passwordHash: newPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      // Mark token as used
      await this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });

      // SECURITY: Invalidate all refresh tokens for this user (force re-login everywhere)
      await this.prisma.refreshToken.deleteMany({
        where: { userId: resetToken.user.id },
      });

      this.logger.log(`Password reset successful for user: ${resetToken.user.email}`);

      return {
        success: true,
        message: 'Password has been reset successfully. Please login with your new password.',
      };
    } catch (error) {
      this.logger.error('Reset password error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to reset password. Please try again.',
      };
    }
  }

  /**
   * Clean up expired and used refresh tokens from the database.
   * Runs every 5 minutes to clean up used tokens after grace period.
   */
  @Cron('0 */15 * * * *')  // Every 15 minutes
  async cleanupExpiredTokens() {
    const now = new Date();
    const gracePeriodCutoff = new Date(now.getTime() - REFRESH_TOKEN_GRACE_PERIOD_SECONDS * 1000);

    // Delete expired tokens
    const expiredResult = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });

    // Delete used tokens past grace period (clear sensitive cached data)
    const usedResult = await this.prisma.refreshToken.deleteMany({
      where: {
        usedAt: { lt: gracePeriodCutoff },
      },
    });

    if (expiredResult.count > 0 || usedResult.count > 0) {
      this.logger.log(`Cleaned up ${expiredResult.count} expired + ${usedResult.count} used refresh tokens`);
    }
    return { success: true, deletedExpired: expiredResult.count, deletedUsed: usedResult.count };
  }

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
          avatarUrl: true,
          isActive: true,
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
          // One-time welcome-tour flag (carried on req.user → /auth/me → web).
          guidesSeen: true,
          enabledModules: true,
          // Customer-portal binding (null for staff) — carried on req.user so
          // CustomerScopeGuard + portal endpoints scope to the caller's own data.
          customerId: true,
          unitId: true,
          organization: { select: { name: true, timezone: true, profileBadges: true, enabledModules: true, subStatus: true, planTier: true, customerPortalEnabled: true, usesExternalWorkers: true } },
          // Custom role
          // Unified roles (Phase 2): org-wide role + per-space assignments. Read
          // to build the resolved `access` object. Legacy space memberships are
          // also read so per-space grants resolve before the backfill runs.
          // isActive so a deactivated role stops granting (M1); space grants are
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

      if (!user || !user.isActive) {
        return { valid: false };
      }

      // Best-effort "last active" heartbeat. This runs ~once per minute per active
      // user (the gateway caches the validated user for AUTH_CACHE_TTL_SECONDS), so
      // it's naturally throttled — no per-request DB write. Fire-and-forget.
      this.prisma.user
        .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
        .catch(() => undefined);

      const { organization, profileBadges, enabledModules: userModules, memberRole, spaceAssignments, ...userData } = user;

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
      const access = buildResolvedAccess({
        userFlags: {
          canCreateTasks: userData.canCreateTasks,
          canViewAllTasks: userData.canViewAllTasks,
          canAssignTasks: userData.canAssignTasks,
          canManageUsers: userData.canManageUsers,
          canViewReports: userData.canViewReports,
        },
        memberRolePermissions: memberRole?.isActive ? memberRole.permissions : undefined,
        spaces: spaceAssignments.map((a) => ({
          spaceId: a.spaceId,
          permissions: a.role?.isActive ? a.role.permissions : undefined,
        })),
        sharedSpaces,
      });
      return {
        valid: true,
        user: {
          ...userData,
          access,
          // Canonicalize the role once at this boundary so every downstream
          // service (and the gateway's req.user) sees ADMIN/MANAGER/EMPLOYEE,
          // never the legacy CLIENT/DISPATCHER/TECHNICIAN values.
          role: normalizeRole(userData.role),
          organizationName: organization?.name || null,
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
          // Billing status carried on req.user so the SubscriptionGuard enforces
          // the read-only lock with zero extra DB reads (cached with the user).
          subStatus: (organization?.subStatus ?? 'ACTIVE').toString().toLowerCase(),
          planTier: organization?.planTier ? organization.planTier.toString().toLowerCase() : null,
          // Org-level portal opt-in (customers only exist when enabled).
          customerPortalEnabled: organization?.customerPortalEnabled ?? false,
        },
      };
    } catch {
      return { valid: false };
    }
  }

  private async generateTokens(userId: string, email: string, role: string, organizationId?: string | null, deviceInfo?: { userAgent?: string; ipAddress?: string }, canViewAllTasks = false, refreshTtl?: string) {
    // organizationId is embedded so downstream services (e.g. the Socket.IO
    // gateway) can scope rooms from the verified token instead of trusting a
    // client-supplied org id.
    const basePayload: Record<string, any> = { sub: userId, email, role };
    if (organizationId) basePayload.organizationId = organizationId;
    // Lets the Socket.IO gateway scope task events to admins + "view all tasks"
    // holders (a room they join) instead of broadcasting to the whole org.
    if (canViewAllTasks) basePayload.canViewAllTasks = true;

    // Token expiration from environment variables. `refreshTtl` (per-session, from
    // login: web honors rememberMe → 24h/30d; mobile → env default 90d) overrides
    // the env default and is carried forward across rotations via the `rtl` claim.
    const accessExpiration = this.configService.get('JWT_ACCESS_EXPIRATION') || '15m';
    // Typed loose (like accessExpiration, which is any from configService) so the
    // jsonwebtoken `expiresIn` StringValue overload accepts it.
    const refreshExpiration: any = refreshTtl || this.configService.get('JWT_REFRESH_EXPIRATION') || '7d';

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
    this.logger.log(`NEW TOKEN CREATED in DB: id=${created.id}, hash=${tokenHash.substring(0, 20)}, expires=${expiresAt}`);

    // Return the plain token to the client (they need it to authenticate)
    return { accessToken, refreshToken };
  }

  // ========== SESSION MANAGEMENT ==========

  async listSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
        usedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: sessions };
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        id: sessionId,
        userId, // ensure user can only revoke their own sessions
      },
    });

    if (result.count === 0) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Session not found' };
    }

    return { success: true, data: null, message: 'Session revoked' };
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string) {
    const where: any = { userId };
    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }

    const result = await this.prisma.refreshToken.deleteMany({ where });

    return { success: true, data: { revoked: result.count }, message: `${result.count} session(s) revoked` };
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

  /**
   * Update user avatar URL
   */
  async updateAvatar(data: { userId: string; avatarUrl: string }) {
    try {
      const user = await this.prisma.user.update({
        where: { id: data.userId },
        data: { avatarUrl: data.avatarUrl },
        select: {
          id: true,
          avatarUrl: true,
        },
      });
      return { success: true, data: user };
    } catch (error) {
      this.logger.error(`Update avatar error: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to update avatar.' };
    }
  }

  /**
   * Remove user avatar URL (returns old URL for S3 cleanup)
   */
  async removeAvatar(data: { userId: string }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { avatarUrl: true },
      });

      if (!user?.avatarUrl) {
        return { success: true, data: { oldAvatarUrl: null } };
      }

      const oldAvatarUrl = user.avatarUrl;

      await this.prisma.user.update({
        where: { id: data.userId },
        data: { avatarUrl: null },
      });

      return { success: true, data: { oldAvatarUrl } };
    } catch (error) {
      this.logger.error(`Remove avatar error: ${error}`);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Failed to remove avatar.' };
    }
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(data: { userId: string; currentPassword: string; newPassword: string }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
      });

      if (!user) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      // Verify current password
      const isCurrentValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Current password is incorrect.',
        };
      }

      // Validate new password (strength is enforced at the gateway DTO too)
      if (data.newPassword.length < 8) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'New password must be at least 8 characters long.',
        };
      }

      // Reject reusing the current password
      const sameAsCurrent = await bcrypt.compare(data.newPassword, user.passwordHash);
      if (sameAsCurrent) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'New password must be different from your current password.',
        };
      }

      // Hash and update
      const newPasswordHash = await bcrypt.hash(data.newPassword, 12);
      await this.prisma.user.update({
        where: { id: data.userId },
        data: { passwordHash: newPasswordHash },
      });

      // SECURITY: revoke all refresh tokens so other sessions/devices are signed
      // out after a password change (consistent with the reset-password flow).
      await this.prisma.refreshToken.deleteMany({ where: { userId: data.userId } });

      this.logger.log(`Password changed for user ${data.userId}`);

      return {
        success: true,
        data: null,
        message: 'Password changed successfully.',
      };
    } catch (error) {
      this.logger.error(`Change password error: ${error}`);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to change password.',
      };
    }
  }

  /**
   * Delete a user's account permanently.
   * Requires password confirmation. Anonymizes personal data and
   * cascading-deletes related records (tokens, push tokens, location, etc.).
   */
  async deleteAccount(data: { userId: string; password: string }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
      });

      if (!user) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found.',
        };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
      if (!isPasswordValid) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Incorrect password.',
        };
      }

      // If user is the last ADMIN of their org, block deletion
      if (user.role === Role.ADMIN && user.organizationId) {
        const otherAdmins = await this.prisma.user.count({
          where: {
            organizationId: user.organizationId,
            role: Role.ADMIN,
            isActive: true,
            id: { not: user.id },
          },
        });

        if (otherAdmins === 0) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'You are the last admin of your organization. Transfer admin role to another member before deleting your account.',
          };
        }
      }

      // Anonymize and deactivate within a transaction
      const deletedEmail = `deleted_${user.id}@deleted.hbcfield.local`;

      await this.prisma.$transaction(async (tx) => {
        // 1. Delete cascading records that reference the user
        await Promise.all([
          tx.refreshToken.deleteMany({ where: { userId: user.id } }),
          tx.passwordResetToken.deleteMany({ where: { userId: user.id } }),
          tx.userPushToken.deleteMany({ where: { userId: user.id } }),
          tx.workerLastLocation.deleteMany({ where: { userId: user.id } }),
          tx.locationHistory.deleteMany({ where: { userId: user.id } }),
          tx.comment.deleteMany({ where: { userId: user.id } }),
          tx.technicianSchedule.deleteMany({ where: { technicianId: user.id } }),
          tx.timeOff.deleteMany({ where: { technicianId: user.id } }),
          tx.joinRequest.deleteMany({ where: { userId: user.id } }),
        ]);

        // 2. Unassign tasks (don't delete them)
        await tx.task.updateMany({
          where: { assignedToId: user.id },
          data: { assignedToId: null, status: 'NEW' },
        });

        // 3. Anonymize user record
        await tx.user.update({
          where: { id: user.id },
          data: {
            email: deletedEmail,
            firstName: 'Deleted',
            lastName: 'User',
            passwordHash: '', // Invalidate login
            isActive: false,
            avatarUrl: null,
            organizationId: null,
            onboardingCompleted: false,
            specialty: null,
            profileBadges: Prisma.DbNull,
          },
        });
      });

      this.logger.log(`Account deleted for user ${data.userId}`);

      return {
        success: true,
        data: null,
        message: 'Account deleted successfully.',
      };
    } catch (error) {
      this.logger.error(`Delete account error: ${error}`);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to delete account.',
      };
    }
  }
}
