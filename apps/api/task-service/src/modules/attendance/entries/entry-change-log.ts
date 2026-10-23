import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, SERVICE_NAMES } from '@hbcfield/shared';
import { emitEvent, attendanceChangedEvent } from '@hbcfield/shared/microservices';

/**
 * What every office change to a time entry leaves behind: the signal that makes
 * every open attendance view refresh, and the audit row.
 */
@Injectable()
export class EntryChangeLog {
  private readonly logger = new Logger(EntryChangeLog.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Broadcast that an admin mutated attendance (edit/approve/reject/delete/manual
   * add) so every open attendance view refreshes in real time — same idea as the
   * clock-in/out events, but for manager-side changes which had no signal before.
   */
  announce(organizationId: string, action: string, entryId?: string) {
    try {
      emitEvent(this.notificationClient, attendanceChangedEvent, { organizationId, action, entryId });
    } catch (err) {
      this.logger.warn(`attendance_changed emit failed (${action}): ${err}`);
    }
  }

  /**
   * One row in the shared activity log per office change to an entry — the
   * indexed per-entity audit trail ([resourceId, createdAt]); no dedicated
   * table. Edits feed the entry's edit-history table; a deletion leaves the only
   * trace there is once the row is gone. Never fails the change it records.
   */
  async audit(params: {
    eventType: 'TIME_ENTRY_EDITED' | 'TIME_ENTRY_DELETED';
    entryId: string;
    actorId: string;
    organizationId: string;
    targetUserId?: string;
    metadata: Record<string, unknown>;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          eventType: params.eventType,
          userId: params.actorId,
          ...(params.targetUserId ? { targetUserId: params.targetUserId } : {}),
          resourceType: 'timeEntry',
          resourceId: params.entryId,
          organizationId: params.organizationId,
          metadata: params.metadata as never,
        },
      });
    } catch (e) {
      this.logger.warn(`Audit-log write failed (${params.eventType}) for entry=${params.entryId}: ${e}`);
    }
  }
}
