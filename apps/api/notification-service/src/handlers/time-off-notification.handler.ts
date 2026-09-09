import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushService } from '../modules/push/push.service';
import { WebsocketGateway } from '../modules/websocket/websocket.gateway';
import { NotificationStore } from '../common/notification-store.service';

/** How a leave kind reads in a sentence. */
const TYPE_LABELS: Record<string, string> = {
  VACATION: 'holiday',
  SICK: 'sick leave',
  FAMILY: 'family leave',
  OTHER: 'time off',
};

/**
 * Leave: somebody asked for days, and somebody answered.
 *
 * Two events, two audiences, and they are deliberately not symmetric. The
 * REQUEST goes to whoever is routed to hear about that member — resolved in
 * task-service, which owns the routing rules; this handler never decides who,
 * it only delivers. The DECISION goes to the one person who asked.
 *
 * Every delivery is best-effort and independent: a phone that cannot be reached
 * must not lose the bell entry, and neither must undo the request itself.
 */
@Controller()
export class TimeOffNotificationHandler {
  private readonly logger = new Logger('TimeOffNotificationHandler');

  constructor(
    private readonly pushService: PushService,
    private readonly websocketGateway: WebsocketGateway,
    private readonly store: NotificationStore,
  ) {}

  @EventPattern('time_off_requested')
  async handleRequested(
    @Payload()
    data: {
      timeOffId: string;
      organizationId: string;
      memberId: string;
      memberName: string;
      type?: string;
      startDate: string;
      endDate: string;
      reason?: string | null;
      recipientIds: string[];
    },
  ) {
    // Never back to the person who asked, and never twice to the same watcher
    // who is also on the space's routing.
    const recipients = [
      ...new Set((data.recipientIds ?? []).filter((id) => id && id !== data.memberId)),
    ];
    this.logger.log(
      `Time-off request: ${data.memberName} ${data.startDate}→${data.endDate}, recipients=${recipients.length}`,
    );
    if (recipients.length === 0) return;

    const kind = TYPE_LABELS[data.type ?? 'VACATION'] ?? 'time off';
    const range = data.startDate === data.endDate ? data.startDate : `${data.startDate} → ${data.endDate}`;
    const body = `${data.memberName} asked for ${kind}: ${range}`;
    const link = '/employees/availability';

    const payload = {
      timeOffId: data.timeOffId,
      memberId: data.memberId,
      memberName: data.memberName,
      type: data.type ?? 'VACATION',
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason ?? null,
      timestamp: new Date().toISOString(),
    };

    // Socket first: an approver with the page open sees the request arrive.
    for (const id of recipients) {
      this.websocketGateway.emitToUser(id, 'time_off_requested', payload);
    }

    try {
      await this.pushService.sendTimeOffRequestPush({
        recipientIds: recipients,
        technicianName: data.memberName,
        startDate: data.startDate,
        endDate: data.endDate,
      });
    } catch (error) {
      this.logger.error(`Failed to send time-off request push: ${error}`);
    }

    // Durable, so it is in the bell whenever they next log in — not only if
    // they happened to be online when it was asked for.
    await this.store.record({
      recipientIds: recipients,
      organizationId: data.organizationId,
      eventType: 'time_off_requested',
      title: 'Time-off request',
      body,
      link,
      data: { timeOffId: data.timeOffId, memberId: data.memberId },
    });
  }

  @EventPattern('time_off_decided')
  async handleDecided(
    @Payload()
    data: {
      timeOffId: string;
      organizationId: string;
      memberId: string;
      approved: boolean;
      rejectionReason?: string | null;
      startDate: string;
      endDate: string;
    },
  ) {
    this.logger.log(
      `Time-off ${data.approved ? 'approved' : 'rejected'}: ${data.timeOffId} → ${data.memberId}`,
    );

    const range = data.startDate === data.endDate ? data.startDate : `${data.startDate} → ${data.endDate}`;
    const title = data.approved ? 'Time off approved' : 'Time off not approved';
    // The reason travels IN the message when it was refused. A refusal that
    // only says "no" sends somebody to ask their manager what happened.
    const body = data.approved
      ? `Your ${range} is approved`
      : data.rejectionReason
        ? `${range} — ${data.rejectionReason}`
        : `Your request for ${range} was not approved`;

    this.websocketGateway.emitToUser(data.memberId, 'time_off_decided', {
      timeOffId: data.timeOffId,
      approved: data.approved,
      rejectionReason: data.rejectionReason ?? null,
      startDate: data.startDate,
      endDate: data.endDate,
      timestamp: new Date().toISOString(),
    });

    try {
      await this.pushService.sendTimeOffApprovedPush({
        technicianId: data.memberId,
        startDate: data.startDate,
        endDate: data.endDate,
        approved: data.approved,
        rejectionReason: data.rejectionReason ?? undefined,
      });
    } catch (error) {
      this.logger.error(`Failed to send time-off decision push: ${error}`);
    }

    await this.store.record({
      recipientIds: [data.memberId],
      organizationId: data.organizationId,
      eventType: 'time_off_decided',
      title,
      body,
      link: '/my/time-off',
      data: { timeOffId: data.timeOffId, approved: data.approved },
    });
  }
}
