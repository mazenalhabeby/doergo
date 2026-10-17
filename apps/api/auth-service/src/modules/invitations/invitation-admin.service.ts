import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { clampListLimit } from '@hbcfield/shared';
import { InvitationServiceBase } from './invitation-service.base';

/** The office's invitations: the list, sending one again, revoking one. */
@Injectable()
export class InvitationAdminService extends InvitationServiceBase {
  /**
   * Validate an invitation code (public endpoint).
   * Returns org name and target role if valid.
   */
  /**
   * Re-send the pending invite for a portal client by email (uses the stored
   * plaintext code — no new code minted). Org-scoped; requires the client to have
   * an email and a PENDING invitation.
   */
  async resendInvitation(data: { organizationId: string; customerId: string }) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { customerId: data.customerId, organizationId: data.organizationId, status: 'PENDING' },
      include: { organization: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!invitation) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'No pending invitation for this client' };
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, organizationId: data.organizationId },
      select: { email: true },
    });
    if (!customer?.email) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'This client has no email address' };
    }
    this.notificationClient.emit('invitation_created', {
      recipientEmail: customer.email,
      organizationName: invitation.organization?.name ?? null,
      invitationCode: invitation.code,
      targetRole: invitation.targetRole,
      expiresAt: invitation.expiresAt.toISOString(),
      // Whoever created the invitation, not whoever pressed "resend": the
      // resend carries no caller, and the creator is who chose this client.
      inviterId: invitation.createdById,
      // A portal invitation always names its client, so the client rule decides.
      locale: await this.clientInviteLocale(data.organizationId, customer.email, data.customerId),
    });
    return { success: true, data: { sentTo: customer.email } };
  }

  /**
   * List invitations for an organization with pagination.
   */
  async listInvitations(data: { organizationId: string; status?: string; page?: number; limit?: number }) {
    const page = data.page || 1;
    const limit = clampListLimit(data.limit, 10, 50);
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
  async revokeInvitation(data: { invitationId: string; organizationId: string; userId: string }) {
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
