import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, personNameById, PrismaService } from '@hbcfield/shared';
import { emitEvent, shiftIssueEventEvent, type EventContract } from '@hbcfield/shared/microservices';
import { NotificationRoutingService } from '../notification-routing/notification-routing.service';

/** Who hears about a shift issue, and telling them: the watchers, the thread's people, names. */
@Injectable()
export class ShiftIssueNotices {
  private readonly logger = new Logger(ShiftIssueNotices.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /** One shared rule for a name (people/person-name.ts) — never "John null". */
  nameOf(userId: string | null | undefined): Promise<string> {
    return personNameById(this.prisma as never, userId);
  }

  /** Resolve the responsible people for the reporter (managers/space leaders). */
  async watcherIds(reportedById: string, organizationId: string): Promise<string[]> {
    const { ids } = await this.routing.resolveWatchers(reportedById, organizationId, 'attendance', false);
    return ids;
  }

  emit<P>(contract: EventContract<P>, payload: P) {
    try {
      emitEvent(this.notificationClient, contract, payload);
    } catch (e) {
      this.logger.warn(`emit ${contract.name} failed: ${e}`);
    }
  }

  // ── broadcast: persist bumped + emit socket/push ────────────────────────────────
  async broadcast(
    issue: {
      id: string;
      organizationId: string;
      reportedById: string;
      assignedToId: string | null;
      title: string;
      severity: string;
      status: string;
    },
    actorId: string,
    event: { id: string; type: string; body: string | null; at: Date; metadata?: unknown },
    extraRecipients: string[] = [],
  ) {
    const watchers = await this.watcherIds(issue.reportedById, issue.organizationId);
    const recipientIds = Array.from(
      new Set([
        ...watchers,
        issue.reportedById,
        ...(issue.assignedToId ? [issue.assignedToId] : []),
        ...extraRecipients,
      ]),
    ).filter((id) => id !== actorId);
    const actorName = await this.nameOf(actorId);
    this.emit(shiftIssueEventEvent, {
      issueId: issue.id,
      organizationId: issue.organizationId,
      title: issue.title,
      severity: issue.severity,
      status: issue.status,
      event: {
        id: event.id,
        type: event.type,
        body: event.body,
        at: event.at,
        actorId,
        actorName,
        // A thread event's metadata is a JSON object (or none) — Prisma types it as any JSON value.
        metadata: (event.metadata as Record<string, unknown> | null) ?? null,
      },
      actorId,
      actorName,
      recipientIds,
    });
  }
}
