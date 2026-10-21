import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@hbcfield/shared';
import { runWithCronLock } from '@hbcfield/shared';

/** Keeping GPS history only as long as it is needed: the nightly prune. */
@Injectable()
export class LocationRetentionService {
  private readonly logger = new Logger(LocationRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retention: prune GPS points older than LOCATION_HISTORY_RETENTION_DAYS
   * (default 90). LocationHistory grows unbounded and dominates query/storage
   * cost, so we delete in capped batches nightly to avoid a single huge DELETE
   * holding a long lock.
   */
  /**
   * Cron entry point. The work is in pruneOldLocationHistory(), which stays directly
   * callable — this only decides whether THIS replica is the one to run it.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldLocationHistoryCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'tracking:pruneLocationHistory', ttlSeconds: 1800, logger: this.logger },
      () => this.pruneOldLocationHistory(),
    );
  }

  async pruneOldLocationHistory(): Promise<number> {
    const days = Number(process.env.LOCATION_HISTORY_RETENTION_DAYS) || 90;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const BATCH = 5000;

    let totalDeleted = 0;
    // Delete in capped batches so no single DELETE holds a long lock. Each batch
    // is one round-trip: a self-join to a LIMITed CTE deletes up to BATCH rows
    // by ctid without ever loading ids into the app (was findMany+deleteMany).
    // Cap iterations as a safety backstop (≤ 1M rows per run).
    for (let i = 0; i < 200; i++) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM location_history
        WHERE ctid IN (
          SELECT ctid FROM location_history
          WHERE timestamp < ${cutoff}
          LIMIT ${BATCH}
        )`;
      totalDeleted += deleted;
      if (deleted < BATCH) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(`Pruned ${totalDeleted} location history points older than ${days}d`);
    }
    return totalDeleted;
  }
}
