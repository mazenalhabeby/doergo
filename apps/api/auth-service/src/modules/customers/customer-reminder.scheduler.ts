import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService, type CrmReach } from '@hbcfield/shared';
import { SERVICE_NAMES, runWithCronLock } from '@hbcfield/shared';
import { emitEvent, customerReminderDueEvent } from '@hbcfield/shared/microservices';
import { CrmReachService } from './crm-reach.service';

/**
 * Sweeps due customer reminders and notifies every manager assigned to the
 * customer (falling back to the owner / the rep who set it). Fires at `notifyAt`
 * (dueAt − lead time), so "remind me 1h before" just works. Runs every minute;
 * each reminder is notified once (notifiedAt guard).
 *
 * ⚠️ Only an ACTIVE client, and only people who still REACH it (an active member
 * of the organization whose CRM reach covers the client today). A rep moved off
 * the account, or who left, was still pushed the client's name and the note.
 */
@Injectable()
export class CustomerReminderScheduler {
  private readonly logger = new Logger(CustomerReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    private readonly reach: CrmReachService,
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
      // A deactivated (deleted) client's reminders wait — never read, never sent.
      where: { type: 'REMINDER', doneAt: null, notifiedAt: null, notifyAt: { lte: now }, customer: { isActive: true } },
      take: 100,
      include: { customer: { select: { name: true, managerIds: true, ownerId: true, spaceId: true } } },
    });
    if (due.length === 0) return;

    const mayReach = this.reachCache();
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

      const customer = r.customer;
      // Recipients: a specific assignee if set, else every assigned manager,
      // else the owner, else whoever set it.
      const named = r.reminderAssigneeId
        ? [r.reminderAssigneeId]
        : Array.from(
            new Set(
              [
                ...(Array.isArray(customer?.managerIds) ? customer.managerIds : []),
                customer?.ownerId,
                r.authorId,
              ].filter(Boolean) as string[],
            ),
          );
      const recipients = customer ? await mayReach(r.organizationId, named, customer) : [];
      if (recipients.length > 0) {
        try {
          emitEvent(this.notificationClient, customerReminderDueEvent, {
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

  /** The people of `ids` who still reach `client`: active members, by the CRM's own rule. Reach read once per person per sweep. */
  private reachCache() {
    const reaches = new Map<string, Promise<{ caller: { userId: string; role: string }; reach: CrmReach } | null>>();
    const of = (organizationId: string, userId: string) => {
      const key = `${organizationId}:${userId}`;
      if (!reaches.has(key)) {
        reaches.set(
          key,
          (async () => {
            const u = await this.prisma.user.findFirst({
              where: { id: userId, organizationId, isActive: true },
              select: { id: true, role: true },
            });
            if (!u) return null;
            const caller = { userId: u.id, role: u.role as string };
            return { caller, reach: await this.reach.crmReachFor(caller, organizationId) };
          })(),
        );
      }
      return reaches.get(key)!;
    };
    return async (
      organizationId: string,
      ids: string[],
      client: { spaceId: string | null; ownerId: string | null; managerIds: string[] },
    ) => {
      const keep = await Promise.all(
        ids.map(async (id) => {
          const r = await of(organizationId, id);
          return !!r && this.reach.canReach(r.reach, client, r.caller);
        }),
      );
      return ids.filter((_, i) => keep[i]);
    };
  }
}
