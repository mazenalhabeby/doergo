import { personName } from '@hbcfield/shared';
import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@hbcfield/shared';
import {
  SERVICE_NAMES,
  Role,
  JOIN_REQUEST_MAX_PENDING_PER_USER,
  JOIN_REQUEST_MAX_PENDING_PER_ORG,
  JOIN_REQUEST_MESSAGE_MAX_LENGTH,
  hashCode,
} from '@hbcfield/shared';
import { emitEvent, joinRequestSubmittedEvent } from '@hbcfield/shared/microservices';
import { orphanUser } from './orphan-user';

/**
 * Asking to join an organization by its code — sending the request, telling the
 * office, withdrawing it.
 */
@Injectable()
export class JoinRequestService {
  private readonly logger = new Logger(JoinRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
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
      emitEvent(this.notificationClient, joinRequestSubmittedEvent, {
        userId,
        userName: requester ? personName(requester) : 'Someone',
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
   * Path B: Submit a join request to an organization.
   */
  async submitJoinRequest(userId: string, data: { orgCode: string; message?: string }) {
    const orphan = await orphanUser(this.prisma, userId);
    if ('refusal' in orphan) return orphan.refusal;

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
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This organization is not accepting new members',
      };
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
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot cancel a request with status: ${request.status}`,
      };
    }

    await this.prisma.joinRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELED' },
    });

    this.logger.log(`Join request ${requestId} canceled by user ${userId}`);

    return { success: true, message: 'Join request canceled' };
  }
}
