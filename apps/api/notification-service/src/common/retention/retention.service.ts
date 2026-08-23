import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, runWithCronLock, } from '@hbcfield/shared';

/**
 * Retention: prune old NotificationDelivery rows nightly (H4). The in-app inbox
 * only ever shows recent notifications, so deliveries older than
 * NOTIFICATION_RETENTION_DAYS (default 90) are removed. Deleted in capped batches
 * (ctid self-join) so no single DELETE holds a long lock — mirrors the
 * tracking-service location-history sweep.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron entry point. The work is in pruneOldNotificationDeliveries(), which stays directly
   * callable — this only decides whether THIS replica is the one to run it.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldNotificationDeliveriesCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'notification:pruneDeliveries', ttlSeconds: 1800, logger: this.logger },
      () => this.pruneOldNotificationDeliveries(),
    );
  }

  async pruneOldNotificationDeliveries(): Promise<number> {
    const days = Number(process.env.NOTIFICATION_RETENTION_DAYS) || 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const BATCH = 5000;

    let totalDeleted = 0;
    // Cap iterations as a safety backstop (≤ 1M rows per run).
    for (let i = 0; i < 200; i++) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM notification_deliveries
        WHERE ctid IN (
          SELECT ctid FROM notification_deliveries
          WHERE "createdAt" < ${cutoff}
          LIMIT ${BATCH}
        )`;
      totalDeleted += deleted;
      if (deleted < BATCH) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(`Pruned ${totalDeleted} notification deliveries older than ${days}d`);
    }
    return totalDeleted;
  }
}
