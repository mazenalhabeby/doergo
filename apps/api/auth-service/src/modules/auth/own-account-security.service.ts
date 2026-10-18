
import { BCRYPT_COST_FACTOR } from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SessionEvents } from '../../common/session-events/session-events.service';
import * as bcrypt from 'bcryptjs';

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
  ) {}

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
}
