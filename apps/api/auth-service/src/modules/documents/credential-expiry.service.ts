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
        const pruned = await this.pruneExpiredRetention();
        if (marked || reminded || pruned) {
          this.logger.log(
            `Documents: ${marked} expired, ${reminded} reminder(s), ${pruned} pruned`,
          );
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
   * Delete what may no longer be kept.
   *
   * Retention is a property of the TYPE, never a global setting: Austrian
   * employee records run about three years past termination, payroll far
   * longer, and a written reference must be producible for thirty. One rule for
   * all of them would be wrong for almost all of them — so `retentionUntil` is
   * computed per document when it is issued, and `null` genuinely means "keep
   * indefinitely" rather than "nobody decided".
   *
   * OPT-IN, like the task-event sweep beside it. Deleting somebody's employment
   * records is not something that should start happening because a service was
   * upgraded; an operator sets DOCUMENT_RETENTION_ENABLED when the organization
   * has decided its policy.
   *
   * A SIGNED document is never swept. Whatever the retention rule says, a
   * contract somebody signed is evidence, and the moment to remove it is a
   * decision a person makes.
   */
  async pruneExpiredRetention(now = new Date()): Promise<number> {
    if (process.env.DOCUMENT_RETENTION_ENABLED !== 'true') return 0;

    // Capped, and in batches, so no single DELETE holds a long lock — the same
    // shape as the existing task-event prune.
    const BATCH = 500;
    let total = 0;

    for (let i = 0; i < 40; i++) {
      const due = await this.prisma.document.findMany({
        where: {
          retentionUntil: { not: null, lt: now },
          status: { notIn: ['SIGNED', 'AWAITING_SIGNATURE'] },
        },
        select: { id: true },
        take: BATCH,
      });
      if (due.length === 0) break;

      const { count } = await this.prisma.document.deleteMany({
        where: { id: { in: due.map((d) => d.id) } },
      });
      total += count;
      if (due.length < BATCH) break;
    }

    /*
      Objects are deliberately left in place.

      They are content-addressed, so two members issued the same policy share
      one object — deleting it with the first row would break the second. A
      sweep that can see the whole picture is the only safe place to collect
      them, and it is not this one.
    */
    if (total > 0) this.logger.log(`Retention: removed ${total} document row(s)`);
    return total;
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
        // PENDING_VERIFICATION is here on purpose: a renewal somebody has
        // already sent in is the single most useful thing to see beside a
        // certificate that is about to lapse. It is marked as not counting yet,
        // never shown as valid.
        status: { in: ['ISSUED', 'SIGNED', 'EXPIRED', 'PENDING_VERIFICATION'] },
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
      /*
        Awaiting review is a STANDING of its own, not a flavour of valid.

        A licence sitting in the review queue with a 2030 date would otherwise
        read as VALID on this board while the dispatch gate — which reads status
        — still refuses the person. The board exists to answer "can this person
        work?", so that gap is the one thing it must not have.
      */
      awaitingVerification: r.status === 'PENDING_VERIFICATION',
      standing:
        r.status === 'PENDING_VERIFICATION' ? 'AWAITING' : credentialStanding(r.expiresOn, now),
      daysLeft: r.expiresOn ? daysUntil(r.expiresOn, now) : null,
      /*
        Whether this actually stops anybody working.

        A lapsed certificate that gates no task type is a reminder; one that
        gates a task type has removed somebody from the pool. Saying which is
        the difference between a list and something a dispatcher can act on.
      */
      blocksDispatch:
        r.type.requiredForWorkflowIds.length > 0 &&
        r.status !== 'PENDING_VERIFICATION' &&
        credentialStanding(r.expiresOn, now) === 'EXPIRED',
      gatesTaskTypes: r.type.requiredForWorkflowIds,
    }));
  }
}
