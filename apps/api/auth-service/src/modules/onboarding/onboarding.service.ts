import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Role,
  Platform,
  TechnicianType,
  WorkMode,
  DEFAULT_PERMISSIONS,
  ORG_CODE_LENGTH,
  ORG_CODE_CHARSET,
  JOIN_REQUEST_MAX_PENDING_PER_USER,
  JOIN_REQUEST_MAX_PENDING_PER_ORG,
  JOIN_REQUEST_MESSAGE_MAX_LENGTH,
  INVITATION_CODE_CHARSET,
  hashCode,
  generateSecureCode,
} from '@doergo/shared';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Path A: Create organization for an orphan user.
   * Creates org with join code, updates user to ADMIN with onboardingCompleted=true.
   */
  async createOrganization(userId: string, data: { name: string; address?: string; industry?: string }) {
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
        },
        select: { id: true, name: true },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: organization.id,
          role: 'ADMIN',
          onboardingCompleted: true,
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
          technicianType: true,
          workMode: true,
        },
      });

      return { organization, user: updatedUser, joinCode };
    });

    this.logger.log(`Organization "${data.name}" created by user ${userId}`);

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

    this.logger.log(`Join request created: user ${userId} → org ${organization.name}`);

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
    const isTechnician = role === Role.TECHNICIAN;

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          organizationId: invitation.organizationId,
          role: invitation.targetRole,
          onboardingCompleted: true,
          platform: defaultPerms.platform,
          canCreateTasks: defaultPerms.canCreateTasks,
          canViewAllTasks: defaultPerms.canViewAllTasks,
          canAssignTasks: defaultPerms.canAssignTasks,
          canManageUsers: defaultPerms.canManageUsers,
          ...(isTechnician
            ? {
                technicianType: invitation.technicianType || 'FREELANCER',
                workMode: invitation.workMode || 'HYBRID',
                specialty: invitation.specialty,
                maxDailyJobs: invitation.maxDailyJobs || 5,
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
          platform: true,
          canCreateTasks: true,
          canViewAllTasks: true,
          canAssignTasks: true,
          canManageUsers: true,
          technicianType: true,
          workMode: true,
        },
      });

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

    // Check for pending join request
    let pendingRequest = null;
    if (needsOnboarding) {
      const request = await this.prisma.joinRequest.findFirst({
        where: { userId, status: 'PENDING' },
        include: {
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (request) {
        pendingRequest = {
          id: request.id,
          organizationName: request.organization.name,
          message: request.message,
          status: request.status,
          createdAt: request.createdAt.toISOString(),
        };
      }
    }

    return {
      success: true,
      data: {
        needsOnboarding,
        hasPendingJoinRequest: !!pendingRequest,
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
    platform?: string;
    technicianType?: string;
    workMode?: string;
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
    const isTechnician = role === Role.TECHNICIAN;

    const result = await this.prisma.$transaction(async (tx) => {
      // Update user with org membership + role + permissions
      const updatedUser = await tx.user.update({
        where: { id: request.userId },
        data: {
          organizationId: data.organizationId,
          role,
          onboardingCompleted: true,
          platform: (data.platform || defaultPerms.platform) as Platform,
          canCreateTasks: defaultPerms.canCreateTasks,
          canViewAllTasks: defaultPerms.canViewAllTasks,
          canAssignTasks: defaultPerms.canAssignTasks,
          canManageUsers: defaultPerms.canManageUsers,
          ...(isTechnician
            ? {
                technicianType: (data.technicianType || 'FREELANCER') as TechnicianType,
                workMode: (data.workMode || 'HYBRID') as WorkMode,
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
          assignedPlatform: (data.platform || defaultPerms.platform) as any,
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

    return { success: true, message: 'Join request rejected' };
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
      data: { joinCodeHash },
    });

    this.logger.log(`Join code regenerated for org ${organizationId}`);

    return {
      success: true,
      data: { joinCode }, // Plain code - only returned at generation time
    };
  }

  /**
   * Get join code info for an organization.
   * Note: Cannot recover plain code from hash, just returns whether one is set.
   */
  async getJoinCode(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { joinCodeHash: true, joinPolicy: true },
    });

    if (!org) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Organization not found' };
    }

    return {
      success: true,
      data: {
        hasJoinCode: !!org.joinCodeHash,
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
}
