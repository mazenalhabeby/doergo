import { MemberOffboarding } from '../../common/member-offboarding/member-offboarding.service';
import { BCRYPT_COST_FACTOR, Role, maskEmail } from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SessionEvents } from '../../common/session-events/session-events.service';
import * as bcrypt from 'bcryptjs';
import { hashToken } from './auth-common';

/**
 * A member's own credentials and account: resetting or changing the password,
 * the avatar, and deleting the account.
 *
 * Part of authentication; `AuthService` is the facade every caller uses.
 */
@Injectable()
export class OwnAccountSecurityService {
  private readonly logger = new Logger(OwnAccountSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents?: SessionEvents,
    @Optional() private readonly offboarding?: MemberOffboarding,
  ) {}

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
      const newPasswordHash = await bcrypt.hash(data.newPassword, BCRYPT_COST_FACTOR);

      /*
        CLAIM the link, then use it — in one transaction.

        It used to be read ("used: false?"), then the password written, then the
        link marked used: two requests carrying the same link in the same
        instant both passed the read and both set a password. The claim is a
        conditional update on `used = false`; exactly one request gets count 1,
        and the loser's transaction is rolled back before it writes anything.
      */
      const claimed = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.passwordResetToken.updateMany({
          where: { id: resetToken.id, used: false, expiresAt: { gt: new Date() } },
          data: { used: true },
        });
        if (claim.count !== 1) return false;

        await tx.user.update({
          where: { id: resetToken.user.id },
          data: {
            passwordHash: newPasswordHash,
            failedLoginAttempts: 0,
            lockedUntil: null,
            // Access tokens already issued die here too, not at their expiry.
            tokensValidAfter: new Date(),
          },
        });

        // SECURITY: Invalidate all refresh tokens for this user (force re-login everywhere)
        await tx.refreshToken.deleteMany({
          where: { userId: resetToken.user.id },
        });
        return true;
      });

      if (!claimed) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'This password reset link has already been used.',
        };
      }
      this.sessionEvents?.sessionsRevoked(resetToken.user.id);

      /*
        ⚠️ Device keys too, not just refresh tokens.

        "Someone has my phone" must have ONE answer that works, and changing the
        password is that answer. A device key left alive would let the stolen
        phone mint a brand-new session with a face — the exact thing the member
        was trying to stop, and worse than before because it needs no password.
      */
      await this.prisma.deviceKey.updateMany({
        where: { userId: resetToken.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      this.logger.log(`Password reset successful for user: ${maskEmail(resetToken.user.email)}`);

      return {
        success: true,
        message: 'Password has been reset successfully. Please login with your new password.',
        // For the gateway, which drops this member's cached session; it strips
        // the id before answering the (unauthenticated) caller.
        userId: resetToken.user.id,
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
      const newPasswordHash = await bcrypt.hash(data.newPassword, BCRYPT_COST_FACTOR);
      await this.prisma.user.update({
        where: { id: data.userId },
        // tokensValidAfter: every access token already issued stops working now,
        // including the one on this request — the member signs in again with
        // the new password, which is the point of changing it.
        data: { passwordHash: newPasswordHash, tokensValidAfter: new Date() },
      });

      // SECURITY: revoke all refresh tokens so other sessions/devices are signed
      // out after a password change (consistent with the reset-password flow).
      await this.prisma.refreshToken.deleteMany({ where: { userId: data.userId } });
      this.sessionEvents?.sessionsRevoked(data.userId);

      /*
        ⚠️ Device keys too, not just refresh tokens.

        "Someone has my phone" must have ONE answer that works, and changing the
        password is that answer. A device key left alive would let the stolen
        phone mint a brand-new session with a face — the exact thing the member
        was trying to stop, and worse than before because it needs no password.
      */
      await this.prisma.deviceKey.updateMany({
        where: { userId: data.userId, revokedAt: null },
        data: { revokedAt: new Date() },
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

      // Their open jobs, workspace assignments and equipment are released by
      // task-service first (it owns those tables). It used to be a raw update
      // HERE that reset every task they had ever held to NEW — finished
      // history included — and left their crew places and custody behind.
      if (user.organizationId) await this.offboarding?.release(user.organizationId, user.id, user.id, { erase: true });

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
          tx.joinRequest.deleteMany({ where: { userId: user.id } }),
        ]);

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
