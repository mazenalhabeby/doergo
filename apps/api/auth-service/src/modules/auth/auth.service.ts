import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

const MAX_SESSIONS_PER_USER = 5;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const PASSWORD_RESET_EXPIRATION_HOURS = 1;

// Hash a token using SHA-256 for secure storage
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    companyName?: string;
  }) {
    try {
      // Sanitize and normalize all string inputs to lowercase
      const email = data.email.trim().toLowerCase();
      const firstName = data.firstName.trim().toLowerCase();
      const lastName = data.lastName.trim().toLowerCase();
      const companyName = data.companyName?.trim().toLowerCase();
      // SECURITY: Force role to CLIENT regardless of input
      const role = 'CLIENT';

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
      const passwordHash = await bcrypt.hash(data.password, 12);

      // If role is CLIENT and companyName is provided, create a new organization
      let organizationId: string | null = null;

      if (role === 'CLIENT' && companyName) {
        const organization = await this.prisma.organization.create({
          data: {
            name: companyName,
            isActive: true,
          },
        });
        organizationId = organization.id;
      }

      // Build user data with sanitized fields
      const userData: any = {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };

      if (organizationId) {
        userData.organizationId = organizationId;
      }

      const user = await this.prisma.user.create({
        data: userData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          organizationId: true,
          createdAt: true,
        },
      });

      return { success: true, data: user };
    } catch (error) {
      this.logger.error('Registration error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to create account. Please try again.',
      };
    }
  }

  async login(data: { email: string; password: string; rememberMe?: boolean }) {
    try {
      // Normalize email to lowercase for lookup
      const email = data.email.trim().toLowerCase();

      const user = await this.prisma.user.findUnique({
        where: { email },
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

      const rememberMe = data.rememberMe ?? false;
      const tokens = await this.generateTokens(user.id, user.email, user.role, rememberMe);

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
      // SECURITY: Hash the incoming token to compare with stored hash
      const tokenHash = hashToken(refreshToken);

      // Find the stored token by hash
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!storedToken) {
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid refresh token',
        };
      }

      if (storedToken.expiresAt < new Date()) {
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
        await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return {
          success: false,
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Account is deactivated',
        };
      }

      // Delete old refresh token (token rotation)
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      // Generate new tokens
      const tokens = await this.generateTokens(
        storedToken.user.id,
        storedToken.user.email,
        storedToken.user.role,
      );

      return { success: true, data: tokens };
    } catch (error) {
      this.logger.error('Refresh token error:', error);
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

      // TODO: Send email with reset link when email service is configured
      // In development, use Prisma Studio or database query to retrieve tokens if needed
      // SECURITY: Never log tokens - even in development
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
   * Clean up all expired refresh tokens from the database.
   * Runs daily at midnight automatically.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredTokens() {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired refresh tokens`);
    return { success: true, deletedCount: result.count };
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
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        return { valid: false };
      }

      return { valid: true, user };
    } catch {
      return { valid: false };
    }
  }

  private async generateTokens(userId: string, email: string, role: string, rememberMe = false) {
    const basePayload = { sub: userId, email, role };

    // Use different refresh token expiration based on rememberMe
    // rememberMe=true: 30 days, rememberMe=false: 24 hours
    const refreshExpiration = rememberMe
      ? this.configService.get('JWT_REFRESH_EXPIRATION_REMEMBER', '30d')
      : this.configService.get('JWT_REFRESH_EXPIRATION', '24h');

    const accessToken = this.jwtService.sign(
      { ...basePayload, jti: randomUUID() },
      {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION', '15m'),
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

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });

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
