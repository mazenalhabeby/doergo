import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

/**
 * Live task updates for open screens: updated, created, declined, deleted, an
 * attachment, a worker's location.
 */
@Controller()
export class TaskLiveHandler {
  private readonly logger = new Logger('TaskLiveHandler');

  constructor(private readonly websocketGateway: WebsocketGateway) {}

  /** Something on a job changed — every open screen on it re-reads (websocket.gateway announceTaskChanged). */
  @EventPattern('task_updated')
  handleTaskUpdated(@Payload() data: { task?: { id?: string } }) {
    const id = data?.task?.id;
    if (typeof id === 'string' && id) this.websocketGateway.announceTaskChanged(id);
  }

  @EventPattern('task_created')
  async handleTaskCreated(@Payload() data: any) {
    this.logger.log(`Task created: ${data.id}`);
    this.websocketGateway.emitTaskCreated(data);
  }

  @EventPattern('task_declined')
  async handleTaskDeclined(@Payload() data: any) {
    this.logger.log(`Task declined: ${data.task.id}`);
    this.websocketGateway.emitTaskDeclined(data.task, data.declinedBy);
  }

  @EventPattern('task_deleted')
  async handleTaskDeleted(@Payload() data: { taskId: string; organizationId: string; spaceId?: string | null }) {
    this.logger.log(`Task deleted: ${data.taskId}`);
    this.websocketGateway.emitTaskDeleted(data.taskId, data.organizationId, data.spaceId ?? undefined);
  }

  @EventPattern('attachment_added')
  async handleAttachmentAdded(@Payload() data: any) {
    this.logger.log(`Attachment added to task: ${data.taskId}`);
    this.websocketGateway.emitAttachmentAdded(data.taskId, data.attachment);
  }

  @EventPattern('worker_location_updated')
  async handleWorkerLocationUpdated(@Payload() data: any) {
    this.websocketGateway.emitWorkerLocationUpdated(data.organizationId, data.workerId, data.location);
  }
}
