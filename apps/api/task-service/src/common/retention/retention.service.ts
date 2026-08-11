import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Retention: prune old TaskEvent rows nightly (H4).
 *
 * OPT-IN by design. TaskEvent backs both the user-visible task timeline AND the
 * Business-tier audit-log feature, so we must NOT silently delete history. Pruning
 * only runs when TASK_EVENT_RETENTION_DAYS is explicitly set to a positive number;
 * otherwise it is disabled and nothing is deleted. Deleted in capped batches
 * (ctid self-join) so no single DELETE holds a long lock.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldTaskEvents(): Promise<number> {
    const days = Number(process.env.TASK_EVENT_RETENTION_DAYS);
    // Disabled unless an operator opts in with a positive retention window —
    // preserves audit-log history by default.
    if (!Number.isFinite(days) || days <= 0) {
      return 0;
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const BATCH = 5000;

    let totalDeleted = 0;
    // Cap iterations as a safety backstop (≤ 1M rows per run).
    for (let i = 0; i < 200; i++) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM task_events
        WHERE ctid IN (
          SELECT ctid FROM task_events
          WHERE "createdAt" < ${cutoff}
          LIMIT ${BATCH}
        )`;
      totalDeleted += deleted;
      if (deleted < BATCH) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(`Pruned ${totalDeleted} task events older than ${days}d`);
    }
    return totalDeleted;
  }

  /**
   * Prune old ActivityLog rows nightly (P10). activity_logs is the
   * highest-frequency audit table (one row per mutation via the gateway
   * interceptor) and previously had no retention → unbounded growth. Same
   * OPT-IN, capped-batch design as task events: disabled unless
   * ACTIVITY_LOG_RETENTION_DAYS is set to a positive number, so audit history is
   * never silently deleted.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldActivityLogs(): Promise<number> {
    const days = Number(process.env.ACTIVITY_LOG_RETENTION_DAYS);
    if (!Number.isFinite(days) || days <= 0) {
      return 0;
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const BATCH = 5000;

    let totalDeleted = 0;
    for (let i = 0; i < 200; i++) {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM activity_logs
        WHERE ctid IN (
          SELECT ctid FROM activity_logs
          WHERE "createdAt" < ${cutoff}
          LIMIT ${BATCH}
        )`;
      totalDeleted += deleted;
      if (deleted < BATCH) break;
    }

    if (totalDeleted > 0) {
      this.logger.log(`Pruned ${totalDeleted} activity logs older than ${days}d`);
    }
    return totalDeleted;
  }
}
