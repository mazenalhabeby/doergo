import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EmailService } from './modules/email/email.service';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';

@Controller()
export class NotificationController {
  constructor(
    private readonly emailService: EmailService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('task_created')
  async handleTaskCreated(@Payload() data: any) {
    console.log('Task created event received:', data.id);
    // Emit to websocket clients
    this.websocketGateway.emitTaskCreated(data);
    // Send email notification (async via queue)
    // this.emailService.queueTaskCreatedEmail(data);
  }

  @EventPattern('task_assigned')
  async handleTaskAssigned(@Payload() data: any) {
    console.log('Task assigned event received:', data.task.id);
    this.websocketGateway.emitTaskAssigned(data.task, data.workerId);
    // Send email to assigned worker
    // this.emailService.queueTaskAssignedEmail(data);
  }

  @EventPattern('task_status_changed')
  async handleTaskStatusChanged(@Payload() data: any) {
    console.log('Task status changed:', data.task.id, data.oldStatus, '->', data.newStatus);
    this.websocketGateway.emitTaskStatusChanged(data.task, data.oldStatus, data.newStatus);
  }

  @EventPattern('comment_added')
  async handleCommentAdded(@Payload() data: any) {
    console.log('Comment added to task:', data.taskId);
    this.websocketGateway.emitCommentAdded(data.taskId, data.comment);
  }

  @EventPattern('attachment_added')
  async handleAttachmentAdded(@Payload() data: any) {
    console.log('Attachment added to task:', data.taskId);
    this.websocketGateway.emitAttachmentAdded(data.taskId, data.attachment);
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.workerId, data.location);
  }
}
