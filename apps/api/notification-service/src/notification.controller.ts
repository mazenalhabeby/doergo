import { Controller, Get, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from './modules/email/email.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';

@Controller()
export class NotificationController {
  private readonly logger = new Logger('NotificationController');

  constructor(
    private readonly emailService: EmailService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  /**
   * HTTP endpoint to get Socket.IO connection statistics
   * GET /socket/stats
   */
  @Get('socket/stats')
  getSocketStats() {
    return this.websocketGateway.getStats();
  }

  /**
   * HTTP endpoint to get list of connected clients
   * GET /socket/clients
   */
  @Get('socket/clients')
  getConnectedClients() {
    return this.websocketGateway.getConnectedClients();
  }

  /**
   * HTTP health check endpoint
   * GET /health
   */
  @Get('health')
  healthCheck() {
    const stats = this.websocketGateway.getStats();
    return {
      status: 'ok',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
      socket: {
        connections: stats.totalConnections,
        authenticated: stats.authenticatedClients,
      },
    };
  }

  @EventPattern('task_created')
  async handleTaskCreated(@Payload() data: any) {
    this.logger.log(`Task created event received: ${data.id}`);
    // Emit to websocket clients
    this.websocketGateway.emitTaskCreated(data);
    // Send email notification (async via queue)
    // this.emailService.queueTaskCreatedEmail(data);
  }

  @EventPattern('task_assigned')
  async handleTaskAssigned(@Payload() data: any) {
    this.logger.log(`Task assigned event received: ${data.task.id}`);
    this.websocketGateway.emitTaskAssigned(data.task, data.workerId);
    // Send email to assigned worker
    // this.emailService.queueTaskAssignedEmail(data);
  }

  @EventPattern('task_status_changed')
  async handleTaskStatusChanged(@Payload() data: any) {
    this.logger.log(`Task status changed: ${data.task.id} ${data.oldStatus} -> ${data.newStatus}`);
    this.websocketGateway.emitTaskStatusChanged(data.task, data.oldStatus, data.newStatus);
  }

  @EventPattern('task_declined')
  async handleTaskDeclined(@Payload() data: any) {
    this.logger.log(`Task declined: ${data.task.id} by ${data.declinedBy?.firstName} ${data.declinedBy?.lastName}`);
    this.websocketGateway.emitTaskDeclined(data.task, data.declinedBy);
  }

  @EventPattern('comment_added')
  async handleCommentAdded(@Payload() data: any) {
    this.logger.log(`Comment added to task: ${data.taskId}`);
    this.websocketGateway.emitCommentAdded(data.taskId, data.comment);
  }

  @EventPattern('attachment_added')
  async handleAttachmentAdded(@Payload() data: any) {
    this.logger.log(`Attachment added to task: ${data.taskId}`);
    this.websocketGateway.emitAttachmentAdded(data.taskId, data.attachment);
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.workerId, data.location);
  }
}
