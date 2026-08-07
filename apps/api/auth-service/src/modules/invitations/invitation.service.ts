import { Injectable, Logger } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BCRYPT_COST_FACTOR,
  DEFAULT_PERMISSIONS,
  getDefaultModules,
  normalizeAccessProfile,
  Role,
  INVITATION_CODE_LENGTH,
  INVITATION_CODE_CHARSET,
  INVITATION_DEFAULT_EXPIRY_HOURS,
  INVITATION_MAX_EXPIRY_HOURS,
  INVITATION_MIN_EXPIRY_HOURS,
  INVITATION_MAX_PENDING_PER_ORG,
} from '@hbcfield/shared';

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
    position?: string;
    scheduleType?: string;
    schedule?: { dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }[];
    monthlyHourBudget?: number;
    enabledModules?: string[];
    specialty?: string;
    maxDailyJobs?: number;
    spaceId?: string;
    // Pre-assigned org role (AccessRole id) applied to the member on accept.
    memberRoleId?: string;
    // Full pre-configured Access Profile (applied to the member on accept).
    accessProfile?: unknown;
    // Customer-portal invite (targetRole = CUSTOMER)
    customerId?: string;
    unitId?: string;
  }) {
    const isCustomerInvite = data.targetRole === Role.CUSTOMER;

    // Non-admin creators may only invite employees (never admins or customers).
    if (data.creatorRole !== Role.ADMIN && data.targetRole !== Role.EMPLOYEE) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'You can only invite employees',
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

    // Target role must be EMPLOYEE or CUSTOMER (ADMIN already blocked above).
    if (data.targetRole !== Role.EMPLOYEE && !isCustomerInvite) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Target role must be EMPLOYEE or CUSTOMER',
      };
    }

    // Customer invites must name an existing Customer in this org (fail closed).
    if (isCustomerInvite) {
      if (!data.customerId) {
        return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'customerId is required for a customer invite' };
      }
      const customer = await this.prisma.customer.findFirst({
        where: { id: data.customerId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!customer) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Customer not found in this organization' };
      }
      if (data.unitId) {
        const unit = await this.prisma.customerUnit.findFirst({
          where: { id: data.unitId, organizationId: data.organizationId },
          select: { id: true },
        });
        if (!unit) {
          return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Unit not found in this organization' };
        }
      }
    }

    // Validate a pre-assigned org role (EMPLOYEE invites only): must be an
    // active ORG/BOTH-scoped role in THIS org. Fail closed — never trust the id.
    let validMemberRoleId: string | null = null;
    if (data.memberRoleId && data.targetRole === Role.EMPLOYEE) {
      const role = await this.prisma.accessRole.findFirst({
        where: {
          id: data.memberRoleId,
          organizationId: data.organizationId,
          isActive: true,
          scope: { in: ['ORG', 'BOTH'] },
        },
        select: { id: true },
      });
      if (!role) {
        return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid role' };
      }
      validMemberRoleId = role.id;
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

    const isTechnician = data.targetRole === Role.EMPLOYEE;

    const invitation = await this.prisma.invitation.create({
      data: {
        // Store the plaintext code (so admins can view/copy it from the list any
        // time) alongside the hash used for fast lookup on validate/accept.
        code,
        codeHash: codeHashValue,
        targetRole: data.targetRole as any,
        organizationId: data.organizationId,
        createdById: data.createdById,
        expiresAt,

        // Job title (e.g. "Plumber"). Blank → null, NOT a work-mode value.
        position: isTechnician ? (data.position?.trim() || null) : null,
        // Schedule pre-set on the invite (applied to the user on accept).
        scheduleType: isTechnician ? (data.scheduleType || null) : null,
        schedule: isTechnician && data.scheduleType === 'FIXED' && data.schedule?.length
          ? (data.schedule as any)
          : undefined,
        monthlyHourBudget: isTechnician && data.scheduleType === 'FLEXIBLE'
          ? (data.monthlyHourBudget ?? null)
          : null,
        specialty: isTechnician ? data.specialty || null : null,
        maxDailyJobs: isTechnician ? data.maxDailyJobs || null : null,
        // Pre-assigned space — applied to the user on accept.
        spaceId: isTechnician ? (data.spaceId || null) : null,
        // Pre-assigned org role (validated above) — applied to the user on accept.
        memberRoleId: isTechnician ? validMemberRoleId : null,
        // Pre-configured Access Profile — sanitized here, re-sanitized on accept.
        accessProfile: isTechnician
          ? ((normalizeAccessProfile(data.accessProfile) as unknown as Prisma.InputJsonValue) ?? undefined)
          : undefined,
        // Customer-portal invite target (bound to the new login on accept).
        customerId: isCustomerInvite ? (data.customerId || null) : null,
        unitId: isCustomerInvite ? (data.unitId || null) : null,
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

        position: invitation.position,
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

      position: invitation.position,
      specialty: invitation.specialty,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Assign an accepting user to the invitation's pre-set space (CompanyLocation).
   * No-op if there is no spaceId or the space no longer belongs to the org. Runs
   * inside the caller's transaction. Idempotent via the userId+locationId unique.
   */
  private async assignInvitationSpace(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
    spaceId: string | null | undefined,
  ) {
    if (!spaceId) return;
    const space = await tx.companyLocation.findFirst({
      where: { id: spaceId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!space) return;
    await tx.spaceAssignment.upsert({
      where: { userId_spaceId: { userId, spaceId } },
      update: { isPrimary: true, effectiveTo: null },
      create: { organizationId, userId, spaceId, isPrimary: true },
    });
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

    // Pre-configured Access Profile (EMPLOYEE only). When present it OVERRIDES the
    // role defaults, so the member's very first screen already matches their final
    // access. Re-sanitized here (never trust the stored JSON blindly).
    const accessProfile =
      invitation.targetRole === 'EMPLOYEE'
        ? normalizeAccessProfile(invitation.accessProfile)
        : null;

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
          canCreateTasks: defaultPerms.canCreateTasks,
          taskCreationScope: defaultPerms.taskCreationScope,
          canViewAllTasks: defaultPerms.canViewAllTasks,
          canAssignTasks: defaultPerms.canAssignTasks,
          canManageUsers: defaultPerms.canManageUsers,
          ...(invitation.targetRole === 'EMPLOYEE'
            ? {
                position: invitation.position || null,
                scheduleType: invitation.scheduleType || 'NONE',
                monthlyHourBudget: invitation.monthlyHourBudget ?? null,
                specialty: invitation.specialty,
                maxDailyJobs: invitation.maxDailyJobs || 5,
                // Pre-assigned org role (validated at invite time) → the member's
                // named role from their first login. Null when none was chosen.
                memberRoleId: invitation.memberRoleId ?? null,
                ...(accessProfile
                  ? {
                      // Admin pre-configured the access → apply it verbatim so the
                      // first screen already matches (overrides the role defaults
                      // set above).
                      enabledModules: accessProfile.enabledModules,
                      canCreateTasks: accessProfile.canCreateTasks,
                      taskCreationScope: accessProfile.taskCreationScope as any,
                      canAssignTasks: accessProfile.canAssignTasks,
                      canViewAllTasks: accessProfile.canViewAllTasks,
                      canManageUsers: accessProfile.canManageUsers,
                      contactable: accessProfile.contactable,
                      contactScope: accessProfile.contactScope,
                      contactAllowedIds: accessProfile.contactAllowedIds,
                      canViewReports: accessProfile.canViewReports,
                      allowRemote: accessProfile.allowRemote,
                    }
                  : {
                      // No pre-config → LEAST-PRIVILEGE: own assigned spaces only
                      // (admins widen later via the Access tab). Standard tabs.
                      enabledModules: {
                        modules: getDefaultModules(invitation.position),
                        spaceScope: 'own',
                      },
                    }),
              }
            : {}),
          // Customer-portal login: bind to the Customer + optional default unit.
          // onboardingCompleted defaults to true → the portal never sees the
          // org-builder wizard. See [[customer-portal]].
          ...(invitation.targetRole === 'CUSTOMER'
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
          canCreateTasks: true,
          taskCreationScope: true,
          canViewAllTasks: true,
          canAssignTasks: true,
          canManageUsers: true,
          customerId: true,
          unitId: true,
        },
      });

      // Pre-set weekly schedule (FIXED invites): create the rows for the new user.
      if (invitation.scheduleType === 'FIXED' && Array.isArray(invitation.schedule)) {
        const rows = (invitation.schedule as any[]).filter(
          (r) => r && typeof r.dayOfWeek === 'number' && r.startTime && r.endTime,
        );
        if (rows.length > 0) {
          await tx.technicianSchedule.createMany({
            data: rows.map((r) => ({
              technicianId: newUser.id,
              dayOfWeek: r.dayOfWeek,
              startTime: r.startTime,
              endTime: r.endTime,
              isActive: r.isActive ?? true,
            })),
          });
        }
      }

      // Pre-assigned space: assign the new user to it (if it still exists in the org).
      await this.assignInvitationSpace(tx, newUser.id, invitation.organizationId, invitation.spaceId);

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
