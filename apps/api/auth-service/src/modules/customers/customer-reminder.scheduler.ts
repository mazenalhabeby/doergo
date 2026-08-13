import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * Sweeps due customer reminders and notifies their owner (the rep who set them).
 * Runs every 5 minutes; each reminder is notified once (notifiedAt guard).
 */
@Injectable()
export class CustomerReminderScheduler {
  private readonly logger = new Logger(CustomerReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  @Cron('*/5 * * * *')
  async sweep() {
    const now = new Date();
    const due = await this.prisma.customerActivity.findMany({
      where: { type: 'REMINDER', doneAt: null, notifiedAt: null, dueAt: { lte: now } },
      take: 100,
      include: { customer: { select: { name: true } } },
    });
    if (due.length === 0) return;

    for (const r of due) {
      if (r.authorId) {
        try {
          this.notificationClient.emit('customer_reminder_due', {
            organizationId: r.organizationId,
            userId: r.authorId,
            customerId: r.customerId,
            customerName: (r as any).customer?.name ?? 'a customer',
            body: r.body ?? '',
          });
        } catch (e) {
          this.logger.warn(`reminder emit failed (${r.id}): ${e}`);
        }
      }
      await this.prisma.customerActivity.update({ where: { id: r.id }, data: { notifiedAt: new Date() } });
    }
    this.logger.log(`Notified ${due.length} due customer reminder(s)`);
  }
}
