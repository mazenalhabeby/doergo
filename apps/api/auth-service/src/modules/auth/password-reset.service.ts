import { BCRYPT_COST_FACTOR, maskEmail } from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { SessionEvents } from '../../common/session-events/session-events.service';
import * as bcrypt from 'bcryptjs';
import { hashToken } from './auth-common';

/** Setting a new password from a reset link. */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Optional: socket revocation is best effort, and unit tests that do not
    // exercise it need not wire it.
    @Optional() private readonly sessionEvents?: SessionEvents,
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
}
