import type { Prisma, JoinRequestStatus } from '@prisma/client';
import { clampListLimit } from '@hbcfield/shared';
import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import {
  SERVICE_NAMES,
  Role,
  DEFAULT_PERMISSIONS,
  mayGrantBaseRole,
  loadOrgPermissionCeiling,
  permissionsExceed,
  permissionsFromUserFlags,
} from '@hbcfield/shared';
import { permissionColumns } from '../../common/records/permission-columns';

/** The office deciding join requests: the list, approving (with a role), refusing. */
@Injectable()
export class JoinRequestReviewService {
  private readonly logger = new Logger(JoinRequestReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * List join requests for an organization (admin view).
   */
  async listJoinRequests(data: { organizationId: string; status?: string; page?: number; limit?: number }) {
    const page = data.page || 1;
    const limit = clampListLimit(data.limit, 10, 50);
    const skip = (page - 1) * limit;

    const where: Prisma.JoinRequestWhereInput = { organizationId: data.organizationId };
    if (data.status && data.status !== 'all') {
      // A filter from the query string; Prisma refuses a value that is not a status (as it always did).
      where.status = data.status as JoinRequestStatus;
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

    const refusal = undecidableRequest(request, data.organizationId, 'approve');
    if (refusal || !request) return refusal;

    const role = data.role as Role;
    const defaultPerms = DEFAULT_PERMISSIONS[role];
    if (!defaultPerms) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Role must be ADMIN or EMPLOYEE' };
    }
    const isTechnician = role === Role.EMPLOYEE;

    /*
      The approver's ceiling — the same rule as an invitation, because approving
      a join request IS inviting somebody, after the fact.

      The DTO accepts ADMIN and the route asks only `canManageUsers`, so before
      this a manager could approve a request from a second account of their own
      as ADMIN and hold the whole organization. Only an admin mints an admin
      (`mayGrantBaseRole`), and nobody grants permissions they do not hold.
    */
    const approver = await loadOrgPermissionCeiling(this.prisma, data.approverId, data.organizationId);
    if (!approver) {
      return { success: false, statusCode: HttpStatus.FORBIDDEN, message: 'Not authorized to manage this request' };
    }
    if (!mayGrantBaseRole(approver.role, role)) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Only an admin can approve somebody as an admin',
      };
    }
    if (!approver.isAdmin && permissionsExceed(approver.perms, permissionsFromUserFlags(defaultPerms))) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'You cannot grant permissions beyond your own',
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      /*
        Claim the request first: a conditional update on PENDING, so two
        approvers (or one double-click) cannot both act on it — the loser's
        transaction stops here, before the member is touched.
      */
      const claim = await tx.joinRequest.updateMany({
        where: { id: data.requestId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          reviewedById: data.approverId,
          reviewedAt: new Date(),
          assignedRole: role,
        },
      });
      if (claim.count !== 1) return null;

      // Update user with org membership + role + permissions
      const updatedUser = await tx.user.update({
        where: { id: request.userId },
        data: {
          organizationId: data.organizationId,
          role,
          onboardingCompleted: true,
          ...permissionColumns(defaultPerms),
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

    if (!result) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'This request has already been handled' };
    }

    this.logger.log(`Join request ${data.requestId} approved: user ${request.userId} → ${data.role}`);
    // A new member is a new seat — the bill moves with them, not at the nightly sweep.
    this.billing.scheduleReconcile(request.organizationId);

    return {
      success: true,
      data: { userId: request.userId, role: data.role },
    };
  }

  /**
   * Reject a join request.
   */
  async rejectJoinRequest(data: { requestId: string; organizationId: string; approverId: string; reason?: string }) {
    const request = await this.prisma.joinRequest.findUnique({
      where: { id: data.requestId },
    });

    const refusal = undecidableRequest(request, data.organizationId, 'reject');
    if (refusal || !request) return refusal;

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
}

/** A join request that may not be decided by this organization now: missing, another org's, or already decided. */
function undecidableRequest(
  request: { organizationId: string; status: string } | null,
  organizationId: string,
  verb: 'approve' | 'reject',
): { success: false; statusCode: HttpStatus; message: string } | null {
  if (!request) {
    return { success: false as const, statusCode: HttpStatus.NOT_FOUND, message: 'Join request not found' };
  }
  if (request.organizationId !== organizationId) {
    return {
      success: false as const,
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Not authorized to manage this request',
    };
  }
  if (request.status !== 'PENDING') {
    return {
      success: false as const,
      statusCode: HttpStatus.BAD_REQUEST,
      message: `Cannot ${verb} a request with status: ${request.status}`,
    };
  }
  return null;
}
