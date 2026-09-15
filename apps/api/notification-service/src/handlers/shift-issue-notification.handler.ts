import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { msg, type Msg } from '../i18n/translate';

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
    const severity = String(data.severity ?? '').toUpperCase();
    try {
      await this.pushService.sendToUsers(
        recipientIds,
        {
          title: msg('issue.created.title', { title: data.title }),
          body: msg('issue.created.body', {
            name: data.reporterName || msg('common.aMember'),
            severity: SEVERITIES.has(severity)
              ? msg(`issue.severity.${severity}` as 'issue.severity.LOW')
              : severity.toLowerCase(),
          }),
        },
        { type: 'shift_issue', issueId: data.issueId },
      );
    } catch (e) {
      this.logger.error(`shift-issue create push failed: ${(e as Error).message}`);
    }
  }

  @EventPattern('shift_issue_event')
  async handleEvent(@Payload() data: any) {
    const recipientIds: string[] = data.recipientIds ?? [];
    const socketTargets = new Set<string>([...recipientIds, data.actorId].filter(Boolean));
    for (const id of socketTargets) this.websocketGateway.emitToUser(id, 'shift_issue.event', data);

    const body = data.event?.type === 'MESSAGE'
      ? msg('issue.event.message', {
          name: data.actorName || msg('common.someone'),
          text: String(data.event?.body ?? '').slice(0, 120),
        })
      : systemLine(data);
    try {
      await this.pushService.sendToUsers(
        recipientIds,
        { title: msg('issue.event.title', { title: data.title }), body },
        { type: 'shift_issue', issueId: data.issueId },
      );
    } catch (e) {
      this.logger.error(`shift-issue event push failed: ${(e as Error).message}`);
    }
  }
}

const SEVERITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

/** What happened on the thread, when it was not somebody writing in it. */
function systemLine(data: any): Msg {
  const name = data.actorName || msg('common.someone');
  // The reason is what the person typed, attached as written.
  const reason = data.event?.body ? ` — ${String(data.event.body).slice(0, 80)}` : '';
  switch (data.event?.type) {
    case 'ACKNOWLEDGED': return msg('issue.event.acknowledged', { name });
    case 'ASSIGNED': return msg('issue.event.assigned', { name: data.event?.metadata?.assignedToName || msg('common.someone') });
    case 'RESOLVED': return msg('issue.event.resolved', { name, reason });
    case 'REOPENED': return msg('issue.event.reopened', { name });
    case 'CLOSED': return msg('issue.event.closed', { name, reason });
    default: return msg('issue.event.updated', { name, reason });
  }
}
