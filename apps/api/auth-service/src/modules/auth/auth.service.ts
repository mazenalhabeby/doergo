import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../common/prisma/prisma.service';
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
  Role,
  Platform,
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
            },
          });

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
              platform: defaultPerms.platform,
              canCreateTasks: defaultPerms.canCreateTasks,
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
              platform: true,
              canCreateTasks: true,
              canViewAllTasks: true,
              canAssignTasks: true,
              canManageUsers: true,
              createdAt: true,
            },
          });

          return newUser;
        });

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
            platform: defaultPerms.platform,
            canCreateTasks: defaultPerms.canCreateTasks,
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
            platform: true,
            canCreateTasks: true,
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

  async login(data: { email: string; password: string; rememberMe?: boolean; userAgent?: string; ipAddress?: string }) {
    try {
      // Normalize email to lowercase for lookup
      const email = data.email.trim().toLowerCase();

      const user = await this.prisma.user.findUnique({
        where: { email },
        include: { organization: { select: { profileBadges: true } } },
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

      // SECURITY: Reset failed attempts on successful login
      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        });
      }

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

      const tokens = await this.generateTokens(user.id, user.email, user.role, {
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
      });

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            organizationId: user.organizationId,
            onboardingCompleted: user.onboardingCompleted,
            avatarUrl: user.avatarUrl,
            // Permission fields
            platform: user.platform,
            canCreateTasks: user.canCreateTasks,
            canViewAllTasks: user.canViewAllTasks,
            canAssignTasks: user.canAssignTasks,
            canManageUsers: user.canManageUsers,
            // Technician-specific fields
            technicianType: user.technicianType,
            workMode: user.workMode,
            specialty: user.specialty,
            // Profile badge visibility
            profileBadges: resolveProfileBadges(user.profileBadges, user.organization?.profileBadges),
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
      this.logger.log(`Token hash generated (first 20 chars): ${tokenHash.substring(0, 20)}`);
      this.logger.log(`Incoming token (first 20 chars): ${refreshToken.substring(0, 20)}`);

      // Find the stored token by hash
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: { include: { organization: { select: { profileBadges: true } } } } },
      });

      if (!storedToken) {
        this.logger.warn('Refresh token not found in database');
        // Debug: List all tokens to see what's in DB
        const allTokens = await this.prisma.refreshToken.findMany({
          select: { id: true, tokenHash: true, usedAt: true, expiresAt: true, userId: true },
        });
        this.logger.warn(`Total tokens in DB: ${allTokens.length}`);
        allTokens.forEach((t, i) => {
          this.logger.warn(`Token ${i}: hash=${t.tokenHash.substring(0, 20)}, usedAt=${t.usedAt}, expires=${t.expiresAt}`);
        });
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
          // Beyond grace period - reject
          this.logger.warn(`Token already used at ${storedToken.usedAt}, grace period expired`);
          return {
            success: false,
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'Token already used',
          };
        }

        // Within grace period - check for cached tokens or wait for them
        if (storedToken.cachedAccessToken && storedToken.cachedRefreshToken) {
          this.logger.log(`Token reuse within grace period (${REFRESH_TOKEN_GRACE_PERIOD_SECONDS}s). Returning cached tokens.`);
          return {
            success: true,
            data: {
              accessToken: storedToken.cachedAccessToken,
              refreshToken: storedToken.cachedRefreshToken,
            },
          };
        }

        // Within grace period but no cached tokens yet - another request is generating them
        // Wait and retry to get the cached tokens (exponential backoff: 50, 100, 200, 400, 800ms)
        this.logger.log('Token used but cached tokens not ready - waiting for concurrent request to finish');
        for (let attempt = 0; attempt < 5; attempt++) {
          const delay = 50 * Math.pow(2, attempt); // 50, 100, 200, 400, 800ms
          await new Promise(resolve => setTimeout(resolve, delay));

          const updatedToken = await this.prisma.refreshToken.findUnique({
            where: { id: storedToken.id },
          });

          if (updatedToken?.cachedAccessToken && updatedToken?.cachedRefreshToken) {
            this.logger.log(`Got cached tokens from concurrent request (attempt ${attempt + 1}, ${delay}ms)`);
            return {
              success: true,
              data: {
                accessToken: updatedToken.cachedAccessToken,
                refreshToken: updatedToken.cachedRefreshToken,
              },
            };
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

          const updatedToken = await this.prisma.refreshToken.findUnique({
            where: { id: storedToken.id },
          });

          if (updatedToken?.cachedAccessToken && updatedToken?.cachedRefreshToken) {
            this.logger.log(`Returning cached tokens from concurrent request (attempt ${attempt + 1}, ${delay}ms)`);
            return {
              success: true,
              data: {
                accessToken: updatedToken.cachedAccessToken,
                refreshToken: updatedToken.cachedRefreshToken,
              },
            };
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
      );

      // Find the new refresh token hash (it was just created by generateTokens)
      const newRefreshTokenHash = hashToken(tokens.refreshToken);
      this.logger.log(`New refresh token hash (first 20 chars): ${newRefreshTokenHash.substring(0, 20)}`);
      this.logger.log(`New refresh token (first 20 chars): ${tokens.refreshToken.substring(0, 20)}`);

      // Update the token with cached values for grace period
      // Use updateMany to avoid throwing if record was somehow deleted
      const updateResult = await this.prisma.refreshToken.updateMany({
        where: { id: storedToken.id },
        data: {
          replacedByTokenHash: newRefreshTokenHash,
          cachedAccessToken: tokens.accessToken,
          cachedRefreshToken: tokens.refreshToken,
        },
      });

      if (updateResult.count === 0) {
        // Token was deleted between claim and update - this shouldn't happen
        // But we already created the new token, so just return success
        this.logger.warn('Token record disappeared after claim - but new tokens were created, returning success');
      } else {
        this.logger.log('Refresh successful - token marked as used with grace period');

        // Schedule deletion of old token after grace period
        setTimeout(async () => {
          try {
            await this.prisma.refreshToken.delete({
              where: { id: storedToken.id },
            });
            this.logger.log(`Deleted old refresh token ${storedToken.id} after grace period`);
          } catch {
            // Token might already be deleted by cleanup job or another process
          }
        }, (REFRESH_TOKEN_GRACE_PERIOD_SECONDS + 1) * 1000);
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
            role: storedToken.user.role,
            organizationId: storedToken.user.organizationId,
            onboardingCompleted: storedToken.user.onboardingCompleted,
            avatarUrl: storedToken.user.avatarUrl,
            platform: storedToken.user.platform,
            canCreateTasks: storedToken.user.canCreateTasks,
            canViewAllTasks: storedToken.user.canViewAllTasks,
            canAssignTasks: storedToken.user.canAssignTasks,
            canManageUsers: storedToken.user.canManageUsers,
            technicianType: storedToken.user.technicianType,
            workMode: storedToken.user.workMode,
            specialty: storedToken.user.specialty,
            profileBadges: resolveProfileBadges(storedToken.user.profileBadges, storedToken.user.organization?.profileBadges),
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

      await this.prisma.refreshToken.deleteMany({
        where: { tokenHash },
      });

      return { success: true, message: 'Logged out successfully' };
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
      const payload = this.jwtService.verify(token);
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
          platform: true,
          canCreateTasks: true,
          canViewAllTasks: true,
          canAssignTasks: true,
          canManageUsers: true,
          // Technician-specific fields
          technicianType: true,
          workMode: true,
          specialty: true,
          // Badge config
          profileBadges: true,
          organization: { select: { profileBadges: true } },
        },
      });

      if (!user || !user.isActive) {
        return { valid: false };
      }

      const { organization, profileBadges, ...userData } = user;
      return {
        valid: true,
        user: {
          ...userData,
          profileBadges: resolveProfileBadges(profileBadges, organization?.profileBadges),
        },
      };
    } catch {
      return { valid: false };
    }
  }

  private async generateTokens(userId: string, email: string, role: string, deviceInfo?: { userAgent?: string; ipAddress?: string }) {
    const basePayload = { sub: userId, email, role };

    // Token expiration from environment variables
    const accessExpiration = this.configService.get('JWT_ACCESS_EXPIRATION') || '15m';
    const refreshExpiration = this.configService.get('JWT_REFRESH_EXPIRATION') || '7d';

    this.logger.log(`Generating tokens with refreshExpiration=${refreshExpiration}`);

    const accessToken = this.jwtService.sign(
      { ...basePayload, jti: randomUUID() },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiration,
      },
    );

    const refreshToken = this.jwtService.sign(
      { ...basePayload, jti: randomUUID() },
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

      // Validate new password
      if (data.newPassword.length < 8) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'New password must be at least 8 characters long.',
        };
      }

      // Hash and update
      const newPasswordHash = await bcrypt.hash(data.newPassword, 12);
      await this.prisma.user.update({
        where: { id: data.userId },
        data: { passwordHash: newPasswordHash },
      });

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
}
