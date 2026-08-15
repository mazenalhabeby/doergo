import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';

/**
 * Bridges Shift Issue events (emitted by task-service) to real-time sockets +
 * push. Events go to each participant's `user:{id}` room — the web inbox / issue
 * thread and the mobile thread listen there and filter by issueId. Push goes to
 * the responsible people (recipientIds), never the actor.
 */
@Controller()
export class ShiftIssueNotificationHandler {
  private readonly logger = new Logger('ShiftIssueNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  @EventPattern('shift_issue_created')
  async handleCreated(@Payload() data: any) {
    const recipientIds: string[] = data.recipientIds ?? [];
    const socketTargets = new Set<string>([...recipientIds, data.reporterId].filter(Boolean));
    for (const id of socketTargets) this.websocketGateway.emitToUser(id, 'shift_issue.created', data);
    for (const id of recipientIds) {
      try {
        await this.pushService.sendToUser(
          id,
          `New issue: ${data.title}`,
          `${data.reporterName || 'A member'} reported a ${String(data.severity ?? '').toLowerCase()} issue`,
          { type: 'shift_issue', issueId: data.issueId },
        );
      } catch (e) {
        this.logger.error(`shift-issue create push failed: ${(e as Error).message}`);
      }
    }
  }

  @EventPattern('shift_issue_event')
  async handleEvent(@Payload() data: any) {
    const recipientIds: string[] = data.recipientIds ?? [];
    const socketTargets = new Set<string>([...recipientIds, data.actorId].filter(Boolean));
    for (const id of socketTargets) this.websocketGateway.emitToUser(id, 'shift_issue.event', data);

    const body = data.event?.type === 'MESSAGE'
      ? `${data.actorName || 'Someone'}: ${(data.event?.body ?? '').slice(0, 120)}`
      : this.systemLine(data);
    for (const id of recipientIds) {
      try {
        await this.pushService.sendToUser(id, `Issue: ${data.title}`, body, { type: 'shift_issue', issueId: data.issueId });
      } catch (e) {
        this.logger.error(`shift-issue event push failed: ${(e as Error).message}`);
      }
    }
  }

  private systemLine(data: any): string {
    const who = data.actorName || 'Someone';
    switch (data.event?.type) {
      case 'ACKNOWLEDGED': return `${who} acknowledged the issue`;
      case 'ASSIGNED': return `Dispatched to ${data.event?.metadata?.assignedToName ?? 'someone'}`;
      case 'RESOLVED': return `${who} marked it resolved`;
      case 'REOPENED': return `${who} reopened it`;
      case 'CLOSED': return `${who} closed it`;
      default: return `${who} updated the issue`;
    }
  }
}
