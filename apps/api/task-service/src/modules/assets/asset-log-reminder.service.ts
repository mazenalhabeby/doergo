import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  runWithCronLock,
  normalizeKindShape,
  findLogType,
  readLogState,
  dueStatus,
  nextReminderAt,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { AssetResponsibleService } from './asset-responsible.service';

/** A backstop per run, not a limit anybody should reach: the next run picks up the rest. */
const BATCH = 500;

/**
 * "The Sprinter's oil is due" — said once, to the people who can do something.
 *
 * ⚠️ A SWEEP OVER A STORED MOMENT, not a job scheduled per asset. Every entry
 * write stores `logRemindAt`, the next instant anything about that asset's due
 * rules can change by time alone (or NOW, when a reading already crossed a
 * lead). The sweep's whole query is `logRemindAt <= now` on an index; an
 * organization with ten thousand assets and nothing due costs one empty read.
 *
 * ⚠️ IDEMPOTENT BY INSERT. A reminder is claimed by inserting its
 * (asset, type, window, stage) row; the unique index refuses a second one. The
 * window is the entry that started the count, so the next oil change opens a
 * new window — and "due soon" and "overdue" are each said exactly once in it,
 * however many replicas run and however often this is re-run.
 *
 * Who hears it: whoever HOLDS it (it is their van), the people routed to hear
 * about those holders, and — when that is nobody — whoever runs the workspace's
 * equipment, then the organization's asset managers. Unlike a late clock-out, a
 * service nobody is told about is work that silently does not happen.
 */
@Injectable()
export class AssetLogReminderService {
  private readonly logger = new Logger(AssetLogReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
    private readonly responsible: AssetResponsibleService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  /** Daily, early: a reminder read over breakfast gets a garage booked the same day. */
  @Cron('0 6 * * *')
  async sweepCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'assets:logDueReminders', ttlSeconds: 600, logger: this.logger },
      () => this.sweep(),
    );
  }

  /** Directly callable, so a test does not have to own a cron lock. Returns reminders sent. */
  async sweep(now: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.asset.findMany({
      where: { logRemindAt: { lte: now } },
      select: {
        id: true, name: true, organizationId: true, logState: true,
        category: { select: { config: true, spaceId: true } },
      },
      orderBy: { logRemindAt: 'asc' },
      take: BATCH,
    });

    let sent = 0;
    for (const asset of candidates) {
      try {
        sent += await this.remindOne(asset, now);
      } catch (e) {
        // One asset's failure must not starve the rest of the batch.
        this.logger.warn(`logbook reminder for ${asset.id} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }

  private async remindOne(
    asset: { id: string; name: string; organizationId: string; logState: unknown; category: { config: unknown; spaceId: string | null } | null },
    now: Date,
  ): Promise<number> {
    const shape = normalizeKindShape(asset.category?.config);
    const state = readLogState(asset.logState);

    const items: Array<Record<string, unknown>> = [];
    for (const s of state.due) {
      const type = findLogType(shape, s.key);
      // A rule removed from the kind since the last write: nothing to say.
      if (!type?.due) continue;
      const reading = s.meterKey ? state.readings[s.meterKey]?.value ?? null : null;
      const status = dueStatus(s, reading, now);
      if (status.stage === 'ok') continue;

      const claimed = await this.claim(asset.organizationId, asset.id, s.key, s.lastEntryId, status.stage === 'overdue' ? 'OVERDUE' : 'SOON');
      if (!claimed) continue;
      items.push({
        logType: s.key,
        label: type.label,
        stage: status.stage,
        dueAt: s.dueAt,
        dueReading: s.dueReading,
        reading,
        unit: s.meterKey ? type.fields.find((f) => f.key === s.meterKey)?.unit ?? null : null,
        daysLeft: status.daysLeft,
        unitsLeft: status.unitsLeft,
      });
    }

    // Look again only when time alone can change something. Written whether or
    // not anything was said, or a fully-reminded asset would be re-read daily.
    await this.prisma.asset.updateMany({
      where: { id: asset.id },
      data: { logRemindAt: nextReminderAt(state.due, now) },
    });

    if (items.length === 0) return 0;

    const recipientIds = await this.recipients(asset.organizationId, asset.id, asset.category?.spaceId ?? null);
    if (recipientIds.length > 0) {
      this.notifications.emit('asset_log_due', {
        assetId: asset.id,
        assetName: asset.name,
        organizationId: asset.organizationId,
        items,
        recipientIds,
      });
    }
    return items.length;
  }

  /** The claim: true when THIS call inserted the row. */
  private async claim(organizationId: string, assetId: string, logType: string, windowKey: string, stage: string): Promise<boolean> {
    try {
      await this.prisma.assetLogReminder.create({ data: { organizationId, assetId, logType, windowKey, stage } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  }

  /** Holders, their routed watchers, then the workspace's and the organization's asset managers. */
  async recipients(organizationId: string, assetId: string, spaceId: string | null): Promise<string[]> {
    const holders = await this.prisma.assetCustody.findMany({
      where: { assetId, endedAt: null, userId: { not: null } },
      select: { userId: true },
    });
    const holderIds = [...new Set(holders.map((h) => h.userId!))];

    const responsible = new Set<string>();
    for (const id of holderIds) {
      const { ids } = await this.routing.resolveWatchers(id, organizationId, 'tasks', false);
      for (const w of ids) responsible.add(w);
    }
    if (responsible.size === 0) {
      for (const id of await this.responsible.spaceManagers(organizationId, spaceId)) responsible.add(id);
    }
    if (responsible.size === 0) {
      for (const id of await this.responsible.orgManagers(organizationId)) responsible.add(id);
    }
    return [...new Set([...holderIds, ...responsible])];
  }
}
