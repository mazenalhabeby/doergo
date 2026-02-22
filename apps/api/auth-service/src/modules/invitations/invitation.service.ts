import { Injectable, Logger } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BCRYPT_COST_FACTOR,
  DEFAULT_PERMISSIONS,
  Role,
  INVITATION_CODE_LENGTH,
  INVITATION_CODE_CHARSET,
  INVITATION_DEFAULT_EXPIRY_HOURS,
  INVITATION_MAX_EXPIRY_HOURS,
  INVITATION_MIN_EXPIRY_HOURS,
  INVITATION_MAX_PENDING_PER_ORG,
} from '@doergo/shared';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a short alphanumeric code using secure randomness.
   * Uses a charset that excludes confusing characters (I, O, 0, 1).
   */
  private generateCode(): string {
    const bytes = randomBytes(INVITATION_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < INVITATION_CODE_LENGTH; i++) {
      code += INVITATION_CODE_CHARSET[bytes[i] % INVITATION_CODE_CHARSET.length];
    }
    return code;
  }

  /**
   * Create a new invitation.
   * ADMIN can invite DISPATCHER or TECHNICIAN.
   * DISPATCHER can only invite TECHNICIAN.
   */
  async createInvitation(data: {
    targetRole: string;
    organizationId: string;
    createdById: string;
    creatorRole: string;
    expiresInHours?: number;
    technicianType?: string;
    workMode?: string;
    specialty?: string;
    maxDailyJobs?: number;
  }) {
    // Permission check: DISPATCHER can only invite TECHNICIAN
    if (data.creatorRole === Role.DISPATCHER && data.targetRole !== Role.TECHNICIAN) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Dispatchers can only invite technicians',
      };
    }

    // Cannot invite ADMIN role (one admin per org via self-registration)
    if (data.targetRole === Role.ADMIN) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Cannot create invitations for ADMIN role',
      };
    }

    // Validate target role
    if (data.targetRole !== Role.DISPATCHER && data.targetRole !== Role.TECHNICIAN) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Target role must be DISPATCHER or TECHNICIAN',
      };
    }

    // Check pending invitation count for org
    const pendingCount = await this.prisma.invitation.count({
      where: { organizationId: data.organizationId, status: 'PENDING' },
    });
    if (pendingCount >= INVITATION_MAX_PENDING_PER_ORG) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Maximum pending invitations (${INVITATION_MAX_PENDING_PER_ORG}) reached for this organization`,
      };
    }

    // Generate unique code with collision retry
    let code: string = '';
    let codeHashValue: string = '';
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      code = this.generateCode();
      codeHashValue = hashCode(code);
      const existing = await this.prisma.invitation.findUnique({
        where: { codeHash: codeHashValue },
      });
      if (!existing) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      this.logger.error('Failed to generate unique invitation code after max attempts');
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to generate unique invitation code. Please try again.',
      };
    }

    // Calculate expiry
    const expiresInHours = Math.min(
      Math.max(data.expiresInHours || INVITATION_DEFAULT_EXPIRY_HOURS, INVITATION_MIN_EXPIRY_HOURS),
      INVITATION_MAX_EXPIRY_HOURS,
    );
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const isTechnician = data.targetRole === Role.TECHNICIAN;

    const invitation = await this.prisma.invitation.create({
      data: {
        codeHash: codeHashValue,
        targetRole: data.targetRole as any,
        organizationId: data.organizationId,
        createdById: data.createdById,
        expiresAt,
        technicianType: isTechnician ? (data.technicianType as any) || 'FREELANCER' : null,
        workMode: isTechnician ? (data.workMode as any) || 'HYBRID' : null,
        specialty: isTechnician ? data.specialty || null : null,
        maxDailyJobs: isTechnician ? data.maxDailyJobs || null : null,
      },
      include: {
        organization: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Invitation created for ${data.targetRole} in org ${data.organizationId} by ${data.createdById}`);

    // Return the plain code to the creator (only available at creation time)
    return {
      success: true,
      data: {
        id: invitation.id,
        code, // Plain code -- only returned on creation
        targetRole: invitation.targetRole,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        technicianType: invitation.technicianType,
        workMode: invitation.workMode,
        specialty: invitation.specialty,
        maxDailyJobs: invitation.maxDailyJobs,
        organization: invitation.organization,
        createdBy: invitation.createdBy,
        createdAt: invitation.createdAt.toISOString(),
      },
    };
  }

  /**
   * Validate an invitation code (public endpoint).
   * Returns org name and target role if valid.
   */
  async validateCode(code: string) {
    const codeHashValue = hashCode(code.toUpperCase().trim());
    const invitation = await this.prisma.invitation.findUnique({
      where: { codeHash: codeHashValue },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return { valid: false, message: 'Invalid invitation code' };
    }

    if (invitation.status !== 'PENDING') {
      return { valid: false, message: 'This invitation has already been used or revoked' };
    }

    if (invitation.expiresAt < new Date()) {
      return { valid: false, message: 'This invitation has expired' };
    }

    return {
      valid: true,
      targetRole: invitation.targetRole,
      organizationName: invitation.organization.name,
      technicianType: invitation.technicianType,
      workMode: invitation.workMode,
      specialty: invitation.specialty,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Accept an invitation and register a new user.
   * Creates the user under the invitation's org with the specified role.
   */
  async acceptInvitation(data: {
    code: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    const codeHashValue = hashCode(data.code.toUpperCase().trim());

    // Find and validate invitation
    const invitation = await this.prisma.invitation.findUnique({
      where: { codeHash: codeHashValue },
      include: { organization: true },
    });

    if (!invitation) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid invitation code',
      };
    }

    if (invitation.status !== 'PENDING') {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This invitation has already been used or revoked',
      };
    }

    if (invitation.expiresAt < new Date()) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This invitation has expired',
      };
    }

    if (!invitation.organization.isActive) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The organization is no longer active',
      };
    }

    // Check email uniqueness
    const email = data.email.trim().toLowerCase();
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

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);

    // Get default permissions for role
    const role = invitation.targetRole as Role;
    const defaultPerms = DEFAULT_PERMISSIONS[role];

    // Create user and mark invitation as accepted in a transaction
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          role: invitation.targetRole,
          organizationId: invitation.organizationId,
          platform: defaultPerms.platform,
          canCreateTasks: defaultPerms.canCreateTasks,
          canViewAllTasks: defaultPerms.canViewAllTasks,
          canAssignTasks: defaultPerms.canAssignTasks,
          canManageUsers: defaultPerms.canManageUsers,
          ...(invitation.targetRole === 'TECHNICIAN'
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
          platform: true,
          canCreateTasks: true,
          canViewAllTasks: true,
          canAssignTasks: true,
          canManageUsers: true,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          usedAt: new Date(),
          acceptedById: newUser.id,
        },
      });

      return newUser;
    });

    this.logger.log(`Invitation accepted: user ${user.id} joined org ${invitation.organizationId} as ${role}`);

    return {
      success: true,
      data: { user },
    };
  }

  /**
   * List invitations for an organization with pagination.
   */
  async listInvitations(data: {
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

    const [invitations, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invitation.count({ where }),
    ]);

    // Auto-expire pending invitations that are past their expiry
    const now = new Date();
    const formatted = invitations.map((inv) => ({
      ...inv,
      // Override status for display if expired but still marked PENDING
      status: inv.status === 'PENDING' && inv.expiresAt < now ? 'EXPIRED' : inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      usedAt: inv.usedAt?.toISOString() || null,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    }));

    return {
      success: true,
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Revoke an invitation (mark as REVOKED).
   */
  async revokeInvitation(data: {
    invitationId: string;
    organizationId: string;
    userId: string;
  }) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: data.invitationId },
    });

    if (!invitation) {
      return {
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Invitation not found',
      };
    }

    if (invitation.organizationId !== data.organizationId) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Not authorized to revoke this invitation',
      };
    }

    if (invitation.status !== 'PENDING') {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot revoke an invitation with status: ${invitation.status}`,
      };
    }

    await this.prisma.invitation.update({
      where: { id: data.invitationId },
      data: { status: 'REVOKED' },
    });

    this.logger.log(`Invitation ${data.invitationId} revoked by user ${data.userId}`);

    return {
      success: true,
      message: 'Invitation revoked successfully',
    };
  }
}
