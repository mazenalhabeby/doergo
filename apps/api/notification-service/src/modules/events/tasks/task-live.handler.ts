import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  eventPattern,
  type EventPayload,
  attachmentAddedEvent,
  taskCreatedEvent,
  taskDeclinedEvent,
  taskDeletedEvent,
  taskUpdatedEvent,
  workerLocationUpdatedEvent,
} from '@hbcfield/shared/microservices';
import { WebsocketGateway } from '../../websocket/websocket.gateway';

/**
 * Live task updates for open screens: updated, created, declined, deleted, an
 * attachment, a worker's location.
 */
@Controller()
export class TaskLiveHandler {
  private readonly logger = new Logger('TaskLiveHandler');

  constructor(private readonly websocketGateway: WebsocketGateway) {}

  /** Something on a job changed — every open screen on it re-reads (websocket.gateway announceTaskChanged). */
  @EventPattern(eventPattern(taskUpdatedEvent))
  handleTaskUpdated(@Payload() data: EventPayload<typeof taskUpdatedEvent>) {
    const id = data?.task?.id;
    if (typeof id === 'string' && id) this.websocketGateway.announceTaskChanged(id);
  }

  @EventPattern(eventPattern(taskCreatedEvent))
  async handleTaskCreated(@Payload() data: EventPayload<typeof taskCreatedEvent>) {
    this.logger.log(`Task created: ${data.id}`);
    this.websocketGateway.emitTaskCreated(data);
  }

  @EventPattern(eventPattern(taskDeclinedEvent))
  async handleTaskDeclined(@Payload() data: EventPayload<typeof taskDeclinedEvent>) {
    this.logger.log(`Task declined: ${data.task.id}`);
    this.websocketGateway.emitTaskDeclined(data.task, data.declinedBy);
  }

  @EventPattern(eventPattern(taskDeletedEvent))
  async handleTaskDeleted(@Payload() data: EventPayload<typeof taskDeletedEvent>) {
    this.logger.log(`Task deleted: ${data.taskId}`);
    this.websocketGateway.emitTaskDeleted(data.taskId, data.organizationId, data.spaceId ?? undefined);
  }

  @EventPattern(eventPattern(attachmentAddedEvent))
  async handleAttachmentAdded(@Payload() data: EventPayload<typeof attachmentAddedEvent>) {
    this.logger.log(`Attachment added to task: ${data.taskId}`);
    this.websocketGateway.emitAttachmentAdded(data.taskId, data.attachment);
  }

  @EventPattern(eventPattern(workerLocationUpdatedEvent))
  async handleWorkerLocationUpdated(@Payload() data: EventPayload<typeof workerLocationUpdatedEvent>) {
    // ⚠️ tracking-service may send no organization; passed on as before.
    this.websocketGateway.emitWorkerLocationUpdated(data.organizationId as string, data.workerId, data.location);
  }
}
