import { MemberOffboarding } from '../../common/member-offboarding/member-offboarding.service';
import { Role } from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@hbcfield/shared';
import * as bcrypt from 'bcryptjs';

/** A member deleting their own account. */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly offboarding?: MemberOffboarding,
  ) {}

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
            message:
              'You are the last admin of your organization. Transfer admin role to another member before deleting your account.',
          };
        }
      }

      // Their open jobs, workspace assignments and equipment are released by
      // task-service first (it owns those tables). It used to be a raw update
      // HERE that reset every task they had ever held to NEW — finished
      // history included — and left their crew places and custody behind.
      if (user.organizationId) await this.offboarding?.release(user.organizationId, user.id, user.id, { erase: true });
      // Comments, positions and push tokens belong to the other services: each erases its own.
      // Never anonymize while another service may still hold their data: no offboarding wired = no deletion.
      if (!this.offboarding) throw new Error('MemberOffboarding is not wired — refusing to delete half an account');
      await this.offboarding.eraseEverywhere(user.id);

      // Anonymize and deactivate within a transaction
      const deletedEmail = `deleted_${user.id}@deleted.hbcfield.local`;

      await this.prisma.$transaction(async (tx) => {
        // 1. Delete cascading records that reference the user
        await Promise.all([
          tx.refreshToken.deleteMany({ where: { userId: user.id } }),
          tx.passwordResetToken.deleteMany({ where: { userId: user.id } }),
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
