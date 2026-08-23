import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SERVICE_NAMES, runWithCronLock, } from '@hbcfield/shared';

/**
 * Sweeps due customer reminders and notifies every manager assigned to the
 * customer (falling back to the owner / the rep who set it). Fires at `notifyAt`
 * (dueAt − lead time), so "remind me 1h before" just works. Runs every minute;
 * each reminder is notified once (notifiedAt guard).
 */
@Injectable()
export class CustomerReminderScheduler {
  private readonly logger = new Logger(CustomerReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Cron entry point. The work is in sweep(), which stays directly
   * callable — this only decides whether THIS replica is the one to run it.
  // Every minute, so the TTL must be shorter than the interval or the job locks itself out of its own next tick.
   */
  @Cron('* * * * *')
  async sweepCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'auth:customerReminderSweep', ttlSeconds: 50, logger: this.logger },
      () => this.sweep(),
    );
  }

  async sweep() {
    const now = new Date();
    const due = await this.prisma.customerActivity.findMany({
      where: { type: 'REMINDER', doneAt: null, notifiedAt: null, notifyAt: { lte: now } },
      take: 100,
      include: { customer: { select: { name: true, managerIds: true, ownerId: true } } },
    });
    if (due.length === 0) return;

    let notified = 0;
    for (const r of due) {
      // Atomically CLAIM the reminder before emitting: only the instance whose
      // update flips notifiedAt from null → now proceeds. Prevents duplicate
      // sends across multiple auth-service instances / overlapping sweeps.
      const claim = await this.prisma.customerActivity.updateMany({
        where: { id: r.id, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
      if (claim.count !== 1) continue;
      notified++;

      const customer: any = (r as any).customer;
      // Recipients: a specific assignee if set, else every assigned manager,
      // else the owner, else whoever set it.
      const recipients = (r as any).reminderAssigneeId
        ? [(r as any).reminderAssigneeId as string]
        : Array.from(
            new Set(
              [
                ...(Array.isArray(customer?.managerIds) ? customer.managerIds : []),
                customer?.ownerId,
                r.authorId,
              ].filter(Boolean) as string[],
            ),
          );
      if (recipients.length > 0) {
        try {
          this.notificationClient.emit('customer_reminder_due', {
            organizationId: r.organizationId,
            userIds: recipients,
            customerId: r.customerId,
            customerName: customer?.name ?? 'a customer',
            body: r.body ?? '',
            reminderKind: r.reminderKind ?? 'OTHER',
            dueAt: r.dueAt ? r.dueAt.toISOString() : null,
          });
        } catch (e) {
          this.logger.warn(`reminder emit failed (${r.id}): ${e}`);
        }
      }
    }
    if (notified > 0) this.logger.log(`Notified ${notified} due customer reminder(s)`);
  }
}
