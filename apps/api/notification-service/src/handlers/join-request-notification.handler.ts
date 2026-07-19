import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

@Controller()
export class JoinRequestNotificationHandler {
  private readonly logger = new Logger('JoinRequestNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('join_request_submitted')
  async handleSubmitted(@Payload() data: {
    userId: string;
    userName: string;
    organizationId: string;
    organizationName: string;
    message?: string;
    recipientIds?: string[];
  }) {
    this.logger.log(`Join request submitted: user=${data.userName}, org=${data.organizationName}`);
    const payload = {
      userId: data.userId,
      userName: data.userName,
      organizationName: data.organizationName,
      message: data.message,
      timestamp: new Date().toISOString(),
    };

    // Target the resolved approvers (admins + Show-in-Management). Fall back to an
    // org-wide broadcast only if none were provided (older producers).
    const recipientIds = data.recipientIds || [];
    if (recipientIds.length) {
      for (const id of recipientIds) {
        this.websocketGateway.emitToUser(id, 'join_request_submitted', payload);
        try {
          await this.pushService.sendToUser(
            id,
            'New join request',
            `${data.userName} asked to join ${data.organizationName}`,
            { type: 'join_request_submitted', organizationId: data.organizationId },
          );
        } catch (error) {
          this.logger.error(`Failed to send join-request push to ${id}: ${error}`);
        }
      }
    } else {
      this.websocketGateway.emitToOrganization(data.organizationId, 'join_request_submitted', payload);
    }
  }

  @EventPattern('join_request_approved')
  async handleApproved(@Payload() data: {
    userId: string;
    userName: string;
    organizationId: string;
    organizationName: string;
    role: string;
    approvedByName: string;
  }) {
    this.logger.log(`Join request approved: user=${data.userName}`);

    try {
      await this.pushService.sendToUser(
        data.userId,
        'Join Request Approved',
        `Your request to join ${data.organizationName} has been approved. Welcome aboard!`,
        { type: 'join_request_approved', organizationId: data.organizationId, role: data.role },
      );
    } catch (error) {
      this.logger.error(`Failed to send join approved push: ${error}`);
    }

    this.websocketGateway.emitToUser(data.userId, 'join_request_approved', {
      organizationId: data.organizationId,
      organizationName: data.organizationName,
      role: data.role,
      approvedByName: data.approvedByName,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('join_request_rejected')
  async handleRejected(@Payload() data: {
    userId: string;
    userName: string;
    organizationId: string;
    organizationName: string;
    reason?: string;
    rejectedByName: string;
  }) {
    this.logger.log(`Join request rejected: user=${data.userName}`);

    try {
      const body = data.reason
        ? `Your request to join ${data.organizationName} was not approved. Reason: ${data.reason}`
        : `Your request to join ${data.organizationName} was not approved.`;

      await this.pushService.sendToUser(
        data.userId,
        'Join Request Not Approved',
        body,
        { type: 'join_request_rejected', organizationId: data.organizationId, reason: data.reason },
      );
    } catch (error) {
      this.logger.error(`Failed to send join rejected push: ${error}`);
    }

    this.websocketGateway.emitToUser(data.userId, 'join_request_rejected', {
      organizationId: data.organizationId,
      organizationName: data.organizationName,
      reason: data.reason,
      rejectedByName: data.rejectedByName,
      timestamp: new Date().toISOString(),
    });
  }
}
