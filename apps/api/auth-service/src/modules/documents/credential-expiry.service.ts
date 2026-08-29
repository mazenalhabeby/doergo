import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import {
  SERVICE_NAMES,
  Role,
  runWithCronLock,
  daysUntil,
  reminderDueAt,
  credentialStanding,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Credentials that are about to lapse, and ones that already have.
 *
 * Two jobs, both nightly:
 *
 *   MARK   — anything past its date becomes EXPIRED. The dispatch gate reads
 *            the date itself, so this does not decide anything; it makes the
 *            state visible on a screen without recomputing it per row.
 *
 *   REMIND — 60, 30 and 7 days out, to the member AND to whoever owns the
 *            roster. Telling only the member is how a certificate lapses
 *            anyway: they are on site, and the person who needed to know was
 *            planning next month's work.
 *
 * Every @Cron here takes the lease first. NestJS starts a schedule in EVERY
 * replica, so without it a three-container deployment sends every reminder
 * three times — and a person who gets three copies of the same warning learns
 * to ignore all of them.
 */
@Injectable()
export class CredentialExpiryService {
  private readonly logger = new Logger(CredentialExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async nightly(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'documents:credentialExpiry', ttlSeconds: 1800, logger: this.logger },
      async () => {
        const marked = await this.markExpired();
        const reminded = await this.sendReminders();
        if (marked || reminded) {
          this.logger.log(`Credentials: ${marked} expired, ${reminded} reminder(s) sent`);
        }
      },
    );
  }

  /**
   * Move anything past its date to EXPIRED.
   *
   * `expiresOn` is a DATE, and the comparison is against the start of today, so
   * a certificate valid "until 29 August" is still valid all of 29 August. A
   * naive `< now()` would expire it at 00:01 on the day it is still good for.
   */
  async markExpired(now = new Date()): Promise<number> {
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const { count } = await this.prisma.document.updateMany({
      where: {
        expiresOn: { lt: startOfToday },
        status: { in: ['ISSUED', 'SIGNED'] },
        type: { isCredential: true },
      },
      data: { status: 'EXPIRED' },
    });
    return count;
  }

  /**
   * Warn about what is about to lapse.
   *
   * Only on the day a threshold is crossed, so a credential sitting at "30 days
   * left" for three weeks produces one message rather than twenty-one.
   */
  async sendReminders(now = new Date()): Promise<number> {
    // The widest threshold bounds the query, so this reads the handful of
    // credentials in the window rather than every credential in the system.
    const horizon = new Date(now.getTime() + 61 * 24 * 60 * 60 * 1000);

    const soon = await this.prisma.document.findMany({
      where: {
        expiresOn: { gte: now, lte: horizon },
        status: { in: ['ISSUED', 'SIGNED'] },
        type: { isCredential: true },
      },
      select: {
        id: true,
        title: true,
        expiresOn: true,
        organizationId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        type: { select: { label: true } },
      },
    });

    /*
      Who else needs to know, resolved once per organization.

      A fifty-credential sweep across three organizations asks three times, not
      fifty. Matches the recipient rule used for join requests — admins and
      anyone who can see the whole board — because those are the people who
      schedule work and will discover the gap otherwise.
    */
    const rosterOwners = new Map<string, string[]>();
    const ownersFor = async (organizationId: string): Promise<string[]> => {
      const cached = rosterOwners.get(organizationId);
      if (cached) return cached;
      const rows = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          OR: [{ role: Role.ADMIN }, { canAssignTasks: true }, { canViewAllTasks: true }],
        },
        select: { id: true },
      });
      const ids = rows.map((r) => r.id);
      rosterOwners.set(organizationId, ids);
      return ids;
    };

    let sent = 0;
    for (const doc of soon) {
      if (!doc.expiresOn) continue;
      const left = daysUntil(doc.expiresOn, now);
      // Fires only ON the threshold day, which is what makes "one message per
      // threshold" true without storing which reminders were already sent.
      if (reminderDueAt(left) !== left) continue;

      try {
        this.notificationClient.emit('credential_expiring', {
          documentId: doc.id,
          organizationId: doc.organizationId,
          userId: doc.user.id,
          userName: `${doc.user.firstName} ${doc.user.lastName}`.trim(),
          email: doc.user.email,
          credential: doc.type.label,
          title: doc.title,
          daysLeft: left,
          expiresOn: doc.expiresOn.toISOString().slice(0, 10),
          standing: credentialStanding(doc.expiresOn, now),
          // The member is told by the handler regardless; these are the people
          // who plan the work and would otherwise find out on the day.
          recipientIds: await ownersFor(doc.organizationId),
        });
        sent++;
      } catch (err) {
        // One unreachable notification must not stop the rest of the sweep.
        this.logger.warn(`Could not queue reminder for ${doc.id}: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  /**
   * The compliance board: everything an organization needs to chase.
   *
   * One grouped read, not one query per member — a fifty-person organization
   * would otherwise open this screen fifty times over.
   */
  async listCompliance(data: { organizationId: string }) {
    const rows = await this.prisma.document.findMany({
      where: {
        organizationId: data.organizationId,
        type: { isCredential: true, isActive: true },
        status: { in: ['ISSUED', 'SIGNED', 'EXPIRED'] },
      },
      select: {
        id: true,
        title: true,
        expiresOn: true,
        status: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        type: {
          select: { id: true, label: true, requiredForWorkflowIds: true },
        },
      },
      orderBy: [{ expiresOn: 'asc' }],
    });

    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      expiresOn: r.expiresOn,
      member: r.user,
      credential: r.type.label,
      standing: credentialStanding(r.expiresOn, now),
      daysLeft: r.expiresOn ? daysUntil(r.expiresOn, now) : null,
      /*
        Whether this actually stops anybody working.

        A lapsed certificate that gates no task type is a reminder; one that
        gates a task type has removed somebody from the pool. Saying which is
        the difference between a list and something a dispatcher can act on.
      */
      blocksDispatch:
        r.type.requiredForWorkflowIds.length > 0 &&
        credentialStanding(r.expiresOn, now) === 'EXPIRED',
      gatesTaskTypes: r.type.requiredForWorkflowIds,
    }));
  }
}
