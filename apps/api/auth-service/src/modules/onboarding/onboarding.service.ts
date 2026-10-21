import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { seedDefaultWorkflow } from '../../common/seed-default-workflow';
import {
  Role,
  DEFAULT_PERMISSIONS,
  ORG_CODE_LENGTH,
  ORG_CODE_CHARSET,
  DEFAULT_ORG_MODULES,
  hashCode,
  generateSecureCode,
} from '@hbcfield/shared';
import { BillingTrialService } from './../billing/billing-trial.service';
import { orphanUser } from './orphan-user';
import { permissionColumns, NEW_ACCOUNT_USER_SELECT } from '../../common/records/permission-columns';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trials: BillingTrialService,
  ) {}

  /**
   * Path A: Create organization for an orphan user.
   * Creates org with join code, updates user to ADMIN with onboardingCompleted=true.
   */
  async createOrganization(
    userId: string,
    data: { name: string; address?: string; industry?: string; firstSpaceName?: string },
  ) {
    // Verify user exists and needs onboarding
    const orphan = await orphanUser(this.prisma, userId);
    if ('refusal' in orphan) return orphan.refusal;

    // Generate org join code
    const joinCode = generateSecureCode(ORG_CODE_LENGTH, ORG_CODE_CHARSET);
    const joinCodeHash = hashCode(joinCode);

    const defaultPerms = DEFAULT_PERMISSIONS[Role.ADMIN];

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: data.name.trim(),
          isActive: true,
          joinCodeHash,
          joinPolicy: 'INVITE_ONLY',
          enabledModules: DEFAULT_ORG_MODULES,
        },
        select: { id: true, name: true },
      });

      // The org's first space is created in the dedicated "Set up your first
      // space" onboarding step — not here. The org starts with no space.

      // Seed the org's default task type (Field Service) so Task Types isn't
      // empty and new tasks have a capability-rich flow out of the box.
      await seedDefaultWorkflow(tx, organization.id);

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: organization.id,
          role: 'ADMIN',
          onboardingCompleted: true,

          ...permissionColumns(defaultPerms),
        },
        select: NEW_ACCOUNT_USER_SELECT,
      });

      return { organization, user: updatedUser, joinCode };
    });

    this.logger.log(`Organization "${data.name}" created by user ${userId}`);

    // Kick off the 14-day trial (subscription row + trial end + tier modules).
    // Non-fatal: a billing hiccup must not block onboarding.
    try {
      await this.trials.startTrial(result.organization.id);
    } catch (e) {
      this.logger.warn(`Failed to start trial for org ${result.organization.id}: ${(e as Error).message}`);
    }

    return {
      success: true,
      data: {
        organization: result.organization,
        joinCode: result.joinCode, // Plain code - only returned at creation time
        user: result.user,
      },
    };
  }

  /**
   * Validate an org join code (Path B step 1).
   * Returns public org info if valid.
   */
  async validateOrgCode(code: string) {
    const codeHashValue = hashCode(code.toUpperCase().trim());

    const organization = await this.prisma.organization.findFirst({
      where: { joinCodeHash: codeHashValue, isActive: true },
      select: { id: true, name: true, joinPolicy: true },
    });

    if (!organization) {
      return { valid: false, message: 'Invalid organization code' };
    }

    if (organization.joinPolicy === 'CLOSED') {
      return { valid: false, message: 'This organization is not accepting new members' };
    }

    return {
      valid: true,
      organizationName: organization.name,
      joinPolicy: organization.joinPolicy,
    };
  }

  /**
   * Get onboarding status for a user.
   */
  async getOnboardingStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingCompleted: true,
        organizationId: true,
      },
    });

    if (!user) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'User not found' };
    }

    const needsOnboarding = !user.onboardingCompleted;

    // Check for pending or recently rejected join request
    let pendingRequest = null;
    if (needsOnboarding) {
      // First check for PENDING request
      let request = await this.prisma.joinRequest.findFirst({
        where: { userId, status: 'PENDING' },
        include: {
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // If no pending, check for recent REJECTED request (so mobile can show rejection reason)
      if (!request) {
        request = await this.prisma.joinRequest.findFirst({
          where: { userId, status: 'REJECTED' },
          include: {
            organization: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: 'desc' },
        });
      }

      if (request) {
        pendingRequest = {
          id: request.id,
          organizationName: request.organization.name,
          message: request.message,
          status: request.status,
          rejectionReason: request.rejectionReason || null,
          createdAt: request.createdAt.toISOString(),
        };
      }
    }

    return {
      success: true,
      data: {
        needsOnboarding,
        hasPendingJoinRequest: !!pendingRequest && pendingRequest.status === 'PENDING',
        pendingRequest,
      },
    };
  }
}
