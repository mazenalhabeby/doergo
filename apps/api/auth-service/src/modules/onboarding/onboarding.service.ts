import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { seedDefaultWorkflow } from '../../common/seed-default-workflow';
import {
  SERVICE_NAMES,
  Role,
  DEFAULT_PERMISSIONS,
  ORG_CODE_LENGTH,
  ORG_CODE_CHARSET,
  JOIN_REQUEST_MAX_PENDING_PER_USER,
  JOIN_REQUEST_MAX_PENDING_PER_ORG,
  JOIN_REQUEST_MESSAGE_MAX_LENGTH,
  INVITATION_CODE_CHARSET,
  DEFAULT_ORG_MODULES,
  getDefaultModules,
  hashCode,
  generateSecureCode,
} from '@hbcfield/shared';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Alert the org's admins + "Show in Management" members that a join request
   * needs approval. Best-effort — never blocks/breaks the submit flow.
   */
  private async notifyJoinRequestSubmitted(
    userId: string,
    organizationId: string,
    organizationName: string,
    message: string | null,
  ): Promise<void> {
    try {
      const [requester, recipients] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } }),
        this.prisma.user.findMany({
          where: {
            organizationId,
            isActive: true,
            OR: [{ role: Role.ADMIN }, { canViewAllTasks: true }, { memberRoleId: { not: null } }],
          },
          select: { id: true },
        }),
      ]);
      this.notificationClient.emit('join_request_submitted', {
        userId,
        userName: requester ? `${requester.firstName} ${requester.lastName}`.trim() : 'Someone',
        organizationId,
        organizationName,
        message: message || undefined,
        recipientIds: recipients.map((r) => r.id),
      });
    } catch (error) {
      this.logger.error(`Failed to emit join_request_submitted: ${error}`);
    }
  }

  /**
   * Path A: Create organization for an orphan user.
   * Creates org with join code, updates user to ADMIN with onboardingCompleted=true.
   */
  async createOrganization(userId: string, data: { name: string; address?: string; industry?: string; firstSpaceName?: string }) {
    // Verify user exists and needs onboarding
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'User not found' };
    }

    if (user.onboardingCompleted) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Onboarding already completed' };
    }

    if (user.organizationId) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'User already belongs to an organization' };
    }

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

        },
      });

      return { organization, user: updatedUser, joinCode };
    });

    this.logger.log(`Organization "${data.name}" created by user ${userId}`);

    // Kick off the 14-day trial (subscription row + trial end + tier modules).
    // Non-fatal: a billing hiccup must not block onboarding.
    try {
      await this.billing.startTrial(result.organization.id);
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
   * Path B: Submit a join request to an organization.
   */
  async submitJoinRequest(userId: string, data: { orgCode: string; message?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'User not found' };
    }

    if (user.onboardingCompleted) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Onboarding already completed' };
    }

    if (user.organizationId) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'User already belongs to an organization' };
    }

    // Validate org code
    const codeHashValue = hashCode(data.orgCode.toUpperCase().trim());
    const organization = await this.prisma.organization.findFirst({
      where: { joinCodeHash: codeHashValue, isActive: true },
      select: { id: true, name: true, joinPolicy: true },
    });

    if (!organization) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid organization code' };
    }

    if (organization.joinPolicy === 'CLOSED') {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'This organization is not accepting new members' };
    }

    // Check user pending request limit
    const userPendingCount = await this.prisma.joinRequest.count({
      where: { userId, status: 'PENDING' },
    });

    if (userPendingCount >= JOIN_REQUEST_MAX_PENDING_PER_USER) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `You can have at most ${JOIN_REQUEST_MAX_PENDING_PER_USER} pending join requests`,
      };
    }

    // Check org pending request limit
    const orgPendingCount = await this.prisma.joinRequest.count({
      where: { organizationId: organization.id, status: 'PENDING' },
    });

    if (orgPendingCount >= JOIN_REQUEST_MAX_PENDING_PER_ORG) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This organization has too many pending join requests. Please try again later.',
      };
    }

    // Check for existing pending request to same org
    const existingRequest = await this.prisma.joinRequest.findFirst({
      where: { userId, organizationId: organization.id, status: 'PENDING' },
    });

    if (existingRequest) {
      return {
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'You already have a pending request to this organization',
      };
    }

    // Validate message length
    const message = data.message?.trim();
    if (message && message.length > JOIN_REQUEST_MESSAGE_MAX_LENGTH) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Message must be at most ${JOIN_REQUEST_MESSAGE_MAX_LENGTH} characters`,
      };
    }

    // OPEN policy: auto-approve immediately
    if (organization.joinPolicy === 'OPEN') {
      // Add user to org directly
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          organizationId: organization.id,
          onboardingCompleted: true,
          role: 'EMPLOYEE',
        },
      });

      // Create an approved join request for audit trail
      const joinRequest = await this.prisma.joinRequest.create({
        data: {
          userId,
          organizationId: organization.id,
          message: message || null,
          status: 'APPROVED',
          reviewedAt: new Date(),
        },
        include: {
          organization: { select: { id: true, name: true } },
        },
      });

      this.logger.log(`Join request auto-approved (OPEN policy): user ${userId} → org ${organization.name}`);

      return {
        success: true,
        data: {
          id: joinRequest.id,
          organizationName: joinRequest.organization.name,
          message: joinRequest.message,
          status: 'APPROVED',
          autoApproved: true,
          createdAt: joinRequest.createdAt.toISOString(),
        },
      };
    }

    // INVITE_ONLY policy: create pending request for admin approval
    const joinRequest = await this.prisma.joinRequest.create({
      data: {
        userId,
        organizationId: organization.id,
        message: message || null,
        status: 'PENDING',
      },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    this.logger.log(`Join request created (INVITE_ONLY): user ${userId} → org ${organization.name}`);

    // Alert admins + "Show in Management" members that approval is needed.
    await this.notifyJoinRequestSubmitted(userId, organization.id, organization.name, message || null);

    return {
      success: true,
      data: {
        id: joinRequest.id,
        organizationName: joinRequest.organization.name,
        message: joinRequest.message,
        status: joinRequest.status,
        createdAt: joinRequest.createdAt.toISOString(),
      },
    };
  }

  /**
   * Path C: Accept an invitation code as an existing (orphan) user.
   */
  async acceptInvitationForExistingUser(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'User not found' };
    }

    if (user.onboardingCompleted) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Onboarding already completed' };
    }

    if (user.organizationId) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'User already belongs to an organization' };
    }

    // Validate invitation
    const codeHashValue = hashCode(code.toUpperCase().trim());
    const invitation = await this.prisma.invitation.findUnique({
      where: { codeHash: codeHashValue },
      include: { organization: true },
    });

    if (!invitation) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid invitation code' };
    }

    if (invitation.status !== 'PENDING') {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'This invitation has already been used or revoked' };
    }

    if (invitation.expiresAt < new Date()) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'This invitation has expired' };
    }

    if (!invitation.organization.isActive) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'The organization is no longer active' };
    }

    const role = invitation.targetRole as Role;
    const defaultPerms = DEFAULT_PERMISSIONS[role];
    const isTechnician = role === Role.EMPLOYEE;

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: invitation.organizationId,
          role: invitation.targetRole,
          onboardingCompleted: true,

          canCreateTasks: defaultPerms.canCreateTasks,
          taskCreationScope: defaultPerms.taskCreationScope,
          canViewAllTasks: defaultPerms.canViewAllTasks,
          canAssignTasks: defaultPerms.canAssignTasks,
          canManageUsers: defaultPerms.canManageUsers,
          ...(isTechnician
            ? {
                position: invitation.position || 'technician',
                specialty: invitation.specialty,
                maxDailyJobs: invitation.maxDailyJobs || 5,
                // Schedule pre-set on the invite (mirror of the register-path accept).
                scheduleType: invitation.scheduleType || 'NONE',
                monthlyHourBudget: invitation.monthlyHourBudget ?? null,
                // Least-privilege default: own assigned spaces only (see accept).
                enabledModules: {
                  modules: getDefaultModules(invitation.position),
                  spaceScope: 'own',
                },
              }
            : {}),
          // Customer-portal invite: bind the login to its Customer + optional unit
          // (mirror of the public accept path) so the portal scopes correctly.
          ...(role === Role.CUSTOMER
            ? {
                customerId: invitation.customerId,
                unitId: invitation.unitId,
              }
            : {}),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          organizationId: true,
          onboardingCompleted: true,
          customerId: true,
          unitId: true,

          canCreateTasks: true,
          taskCreationScope: true,
          canViewAllTasks: true,
          canAssignTasks: true,
          canManageUsers: true,

        },
      });

      // Pre-set weekly schedule (FIXED invites): create the rows for the user.
      if (isTechnician && invitation.scheduleType === 'FIXED' && Array.isArray(invitation.schedule)) {
        const rows = (invitation.schedule as any[]).filter(
          (r) => r && typeof r.dayOfWeek === 'number' && r.startTime && r.endTime,
        );
        if (rows.length > 0) {
          await tx.technicianSchedule.createMany({
            data: rows.map((r) => ({
              technicianId: userId,
              dayOfWeek: r.dayOfWeek,
              startTime: r.startTime,
              endTime: r.endTime,
              isActive: r.isActive ?? true,
            })),
          });
        }
      }

      // Pre-assigned space: assign the user to it (if it still exists in the org).
      if (isTechnician && invitation.spaceId) {
        const space = await tx.companyLocation.findFirst({
          where: { id: invitation.spaceId, organizationId: invitation.organizationId, isActive: true },
          select: { id: true },
        });
        if (space) {
          await tx.technicianAssignment.upsert({
            where: { userId_locationId: { userId, locationId: invitation.spaceId } },
            update: { isPrimary: true, effectiveTo: null },
            create: { userId, locationId: invitation.spaceId, isPrimary: true },
          });
        }
      }

      // Customer portal: the resident owns their identity. Sync the Customer
      // record's name from the account they just registered, so the office
      // dashboard (which reads Customer.name) and the app show the same name.
      if (role === Role.CUSTOMER && invitation.customerId) {
        const fullName = [updatedUser.firstName, updatedUser.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (fullName) {
          await tx.customer.update({
            where: { id: invitation.customerId },
            data: { name: fullName },
          });
        }
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          usedAt: new Date(),
          acceptedById: userId,
        },
      });

      return updatedUser;
    });

    this.logger.log(`Invitation accepted by existing user ${userId} → org ${invitation.organizationId} as ${role}`);

    return { success: true, data: { user: result } };
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

  /**
   * List join requests for an organization (admin view).
   */
  async listJoinRequests(data: {
    organizationId: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page || 1;
    const limit = Math.min(data.limit || 10, 50);
    const skip = (page - 1) * limit;

    const where: any = { organizationId: data.organizationId };
    if (data.status && data.status !== 'all') {
      where.status = data.status;
    }

    const [requests, total] = await Promise.all([
      this.prisma.joinRequest.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.joinRequest.count({ where }),
    ]);

    const formatted = requests.map((req) => ({
      id: req.id,
      user: req.user,
      message: req.message,
      status: req.status,
      assignedRole: req.assignedRole,
      assignedPlatform: req.assignedPlatform,
      reviewedBy: req.reviewedBy,
      reviewedAt: req.reviewedAt?.toISOString() || null,
      rejectionReason: req.rejectionReason,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt.toISOString(),
    }));

    return {
      success: true,
      data: formatted,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Approve a join request: assign role/permissions, update user, mark APPROVED.
   */
  async approveJoinRequest(data: {
    requestId: string;
    organizationId: string;
    approverId: string;
    role: string;
    position?: string;
    enabledModules?: string[];
    specialty?: string;
    maxDailyJobs?: number;
  }) {
    const request = await this.prisma.joinRequest.findUnique({
      where: { id: data.requestId },
      include: { user: true },
    });

    if (!request) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Join request not found' };
    }

    if (request.organizationId !== data.organizationId) {
      return { success: false, statusCode: HttpStatus.FORBIDDEN, message: 'Not authorized to manage this request' };
    }

    if (request.status !== 'PENDING') {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: `Cannot approve a request with status: ${request.status}` };
    }

    const role = data.role as Role;
    const defaultPerms = DEFAULT_PERMISSIONS[role];
    const isTechnician = role === Role.EMPLOYEE;

    const result = await this.prisma.$transaction(async (tx) => {
      // Update user with org membership + role + permissions
      const updatedUser = await tx.user.update({
        where: { id: request.userId },
        data: {
          organizationId: data.organizationId,
          role: role as any,
          onboardingCompleted: true,
          canCreateTasks: defaultPerms.canCreateTasks,
          taskCreationScope: defaultPerms.taskCreationScope,
          canViewAllTasks: defaultPerms.canViewAllTasks,
          canAssignTasks: defaultPerms.canAssignTasks,
          canManageUsers: defaultPerms.canManageUsers,
          ...(isTechnician
            ? {
                position: data.position || 'technician',
                enabledModules: data.enabledModules || ['tasks', 'clock', 'time_off'],
                specialty: data.specialty || null,
                maxDailyJobs: data.maxDailyJobs || 5,
              }
            : {}),
        },
      });

      // Mark request as approved
      await tx.joinRequest.update({
        where: { id: data.requestId },
        data: {
          status: 'APPROVED',
          reviewedById: data.approverId,
          reviewedAt: new Date(),
          assignedRole: data.role as any,
        },
      });

      // Cancel any other pending requests from this user
      await tx.joinRequest.updateMany({
        where: {
          userId: request.userId,
          status: 'PENDING',
          id: { not: data.requestId },
        },
        data: { status: 'CANCELED' },
      });

      return updatedUser;
    });

    this.logger.log(`Join request ${data.requestId} approved: user ${request.userId} → ${data.role}`);

    return {
      success: true,
      data: { userId: request.userId, role: data.role },
    };
  }

  /**
   * Reject a join request.
   */
  async rejectJoinRequest(data: {
    requestId: string;
    organizationId: string;
    approverId: string;
    reason?: string;
  }) {
    const request = await this.prisma.joinRequest.findUnique({
      where: { id: data.requestId },
    });

    if (!request) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Join request not found' };
    }

    if (request.organizationId !== data.organizationId) {
      return { success: false, statusCode: HttpStatus.FORBIDDEN, message: 'Not authorized to manage this request' };
    }

    if (request.status !== 'PENDING') {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: `Cannot reject a request with status: ${request.status}` };
    }

    await this.prisma.joinRequest.update({
      where: { id: data.requestId },
      data: {
        status: 'REJECTED',
        reviewedById: data.approverId,
        reviewedAt: new Date(),
        rejectionReason: data.reason || null,
      },
    });

    this.logger.log(`Join request ${data.requestId} rejected by ${data.approverId}`);

    return { success: true, message: 'Join request rejected', data: { userId: request.userId } };
  }

  /**
   * Cancel own join request (user action).
   */
  async cancelJoinRequest(requestId: string, userId: string) {
    const request = await this.prisma.joinRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Join request not found' };
    }

    if (request.userId !== userId) {
      return { success: false, statusCode: HttpStatus.FORBIDDEN, message: 'Not authorized to cancel this request' };
    }

    if (request.status !== 'PENDING') {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: `Cannot cancel a request with status: ${request.status}` };
    }

    await this.prisma.joinRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELED' },
    });

    this.logger.log(`Join request ${requestId} canceled by user ${userId}`);

    return { success: true, message: 'Join request canceled' };
  }

  /**
   * Regenerate org join code (admin action).
   */
  async regenerateJoinCode(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });

    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }

    const joinCode = generateSecureCode(ORG_CODE_LENGTH, ORG_CODE_CHARSET);
    const joinCodeHash = hashCode(joinCode);

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { joinCode, joinCodeHash },
    });

    this.logger.log(`Join code regenerated for org ${organizationId}`);

    return {
      success: true,
      data: { joinCode },
    };
  }

  /**
   * Get join code info for an organization.
   */
  async getJoinCode(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { joinCode: true, joinCodeHash: true, joinPolicy: true },
    });

    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }

    return {
      success: true,
      data: {
        hasJoinCode: !!org.joinCodeHash,
        joinCode: org.joinCode || null,
        joinPolicy: org.joinPolicy,
      },
    };
  }

  /**
   * Update organization join policy.
   */
  async updateJoinPolicy(organizationId: string, joinPolicy: string) {
    const validPolicies = ['OPEN', 'INVITE_ONLY', 'CLOSED'];
    if (!validPolicies.includes(joinPolicy)) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid join policy' };
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { joinPolicy: joinPolicy as any },
    });

    this.logger.log(`Join policy updated to ${joinPolicy} for org ${organizationId}`);

    return { success: true, data: { joinPolicy } };
  }

  async updateProfileBadges(organizationId: string, profileBadges: any) {
    // Validate the shape
    const valid = profileBadges
      && typeof profileBadges === 'object'
      && typeof profileBadges.showRole === 'boolean'
      && typeof profileBadges.showSpecialty === 'boolean';

    if (!valid) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid profile badges config' };
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { profileBadges },
    });

    return { success: true, data: { profileBadges } };
  }

  async getProfileBadges(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { profileBadges: true },
    });

    return { success: true, data: { profileBadges: org?.profileBadges || null } };
  }

  async getOrgProfile(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        industry: true,
        address: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
        email: true,
        website: true,
        timezone: true,
        logoUrl: true,
        joinPolicy: true,
        profileBadges: true,
        notificationPrefs: true,
        securitySettings: true,
        enabledModules: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    });

    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }

    return { success: true, data: { ...org, memberCount: org._count.users } };
  }

  async updateOrgProfile(organizationId: string, updates: any) {
    const allowedFields = ['name', 'industry', 'address', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'phone', 'email', 'website', 'timezone', 'logoUrl', 'enabledModules'];
    const data: any = {};

    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        data[key] = updates[key];
      }
    }

    if (Object.keys(data).length === 0) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'No valid fields to update' };
    }

    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data,
      select: { id: true, name: true, industry: true, address: true, addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true, country: true, phone: true, email: true, website: true, timezone: true, logoUrl: true, enabledModules: true },
    });

    return { success: true, data: org };
  }

  async updateNotificationPrefs(organizationId: string, prefs: any) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { notificationPrefs: prefs },
    });

    return { success: true, data: { notificationPrefs: prefs } };
  }

  async updateSecuritySettings(organizationId: string, settings: any) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { securitySettings: settings },
    });

    return { success: true, data: { securitySettings: settings } };
  }
}
