import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  emailAllowed,
  isDeliverableAddress,
  isOrganizationSuspended,
  PrismaService,
  shiftClosedEmail,
  taskAssignedEmail,
  taskCompletedEmail,
  taskDigestEmail,
  type MemberEmail,
} from '@hbcfield/shared';
import { KeyedCoalescer } from '../../common/keyed-coalescer';
import { EmailService, type EmailRecipient } from './email.service';

/** One member email per person per window, however many events a burst produces. */
export const MEMBER_EMAIL_WINDOW_MS = 2 * 60_000;

/** The facts a task email needs. What the task-service event already carries. */
export interface TaskEmailFacts {
  id: string;
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  locationAddress?: string | null;
}

interface HeldTask {
  task: TaskEmailFacts;
}

/** Somebody an email may go to, after every rule below. */
export interface MemberEmailRecipient extends EmailRecipient {
  id: string;
  firstName: string;
}

/**
 * The three member emails, sent — to the right people, and not too often.
 *
 * WHO is decided here, server-side, from user ids and nothing else. An address
 * carried in an event is not trusted even from our own services: the events
 * used to have room for `workerEmail` and `creatorEmail`, nothing ever filled
 * them, and a field like that is one careless emitter away from mailing
 * whatever address a request body contained.
 *
 * A person is emailed only when ALL of these hold, checked in ONE query for the
 * whole list:
 *  · they are not the ACTOR — assigning yourself a task, or completing one you
 *    created, is not news to you;
 *  · their account is active and their organization is not switched off;
 *  · they are staff: no CUSTOMER (a portal client) and no EXTERNAL member (a
 *    client's supervisor) is emailed about the organization's internal work;
 *  · the address could ever be delivered;
 *  · their organization allows the email AND they have not turned it off
 *    (`emailAllowed` in shared — the ceiling and the opt-out).
 *
 * HOW OFTEN is the coalescer's: the first email for a person goes at once, the
 * rest of a burst waits for the window and arrives as ONE digest. Twenty tasks
 * assigned in one go are two emails, not twenty — the twentieth identical email
 * is the one that teaches somebody to filter the sender, which costs every
 * email after it.
 */
@Injectable()
export class MemberEmailsService implements OnModuleDestroy {
  private readonly logger = new Logger(MemberEmailsService.name);

  private readonly assigned = new KeyedCoalescer<HeldTask>(MEMBER_EMAIL_WINDOW_MS, (userId, held) =>
    this.sendDigest('taskAssigned', userId, held),
  );
  private readonly completed = new KeyedCoalescer<HeldTask>(MEMBER_EMAIL_WINDOW_MS, (userId, held) =>
    this.sendDigest('taskCompleted', userId, held),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  onModuleDestroy() {
    this.assigned.dispose();
    this.completed.dispose();
  }

  // ── Who ─────────────────────────────────────────────────────────────────

  /**
   * The people from `userIds` this email may go to. One query, whatever the
   * length of the list; an empty list asks nothing.
   */
  async recipients(
    kind: MemberEmail,
    userIds: Array<string | null | undefined>,
    opts: { actorId?: string | null } = {},
  ): Promise<MemberEmailRecipient[]> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== opts.actorId))];
    if (ids.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        email: true,
        firstName: true,
        isActive: true,
        isExternal: true,
        role: true,
        notificationPrefs: true,
        organization: { select: { notificationPrefs: true, suspendedAt: true } },
      },
    });
    return rows
      .filter(
        (u: any) =>
          u.isActive &&
          !u.isExternal &&
          u.role !== 'CUSTOMER' &&
          // The recipient's OWN organization sets the ceiling: it is the one
          // that employs them and the one whose Settings screen they would look
          // at. A guest assigned across a shared space is governed by home.
          !!u.organization &&
          !isOrganizationSuspended(u.organization) &&
          isDeliverableAddress(u.email) &&
          emailAllowed(u.organization.notificationPrefs, u.notificationPrefs, kind),
      )
      .map((u: any) => ({ id: u.id, email: u.email, firstName: u.firstName ?? '' }));
  }

  // ── Tasks ───────────────────────────────────────────────────────────────

  /** "A task was assigned to you" — to the person given the work. */
  async taskAssigned(input: { task: TaskEmailFacts; recipientId: string; actorId?: string | null }) {
    await this.offerTask('taskAssigned', this.assigned, input);
  }

  /** "A task you created was completed" — to its creator. */
  async taskCompleted(input: { task: TaskEmailFacts; recipientId: string; actorId?: string | null }) {
    await this.offerTask('taskCompleted', this.completed, input);
  }

  private async offerTask(
    kind: 'taskAssigned' | 'taskCompleted',
    coalescer: KeyedCoalescer<HeldTask>,
    input: { task: TaskEmailFacts; recipientId: string; actorId?: string | null },
  ) {
    // The actor is dropped BEFORE the window: somebody bulk-assigning work to
    // themselves must not open a window that holds the next real assignment.
    if (!input.recipientId || !input.task?.id || input.recipientId === input.actorId) return;
    if (!coalescer.offer(input.recipientId, { task: input.task })) return;

    const [recipient] = await this.recipients(kind, [input.recipientId]);
    if (!recipient) return;
    const task = { ...input.task, url: this.link(`/tasks/${encodeURIComponent(input.task.id)}`) };
    await this.email.sendToMembers([recipient], (locale) =>
      kind === 'taskAssigned' ? taskAssignedEmail(locale, task) : taskCompletedEmail(locale, task),
    );
  }

  /** Everything held while a person's window was open, as one email. */
  private async sendDigest(kind: 'taskAssigned' | 'taskCompleted', userId: string, held: HeldTask[]) {
    try {
      // The same task twice in a window (reassigned back, say) is one line.
      const tasks = [...new Map(held.map((h) => [h.task.id, h.task])).values()];
      const [recipient] = await this.recipients(kind, [userId]);
      if (!recipient || tasks.length === 0) return;
      const withLinks = tasks.map((t) => ({ ...t, url: this.link(`/tasks/${encodeURIComponent(t.id)}`) }));
      await this.email.sendToMembers([recipient], (locale) =>
        taskDigestEmail(locale, {
          kind: kind === 'taskAssigned' ? 'assigned' : 'completed',
          tasks: withLinks,
          url: this.link('/tasks'),
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to send ${kind} digest: ${error}`);
    }
  }

  // ── A shift left open ───────────────────────────────────────────────────

  /**
   * The sweep closed a shift with a temporary time. The member is emailed
   * alongside the push, because the push may never have reached a phone that
   * was switched off for the weekend — and the answer is what their hours are
   * counted from.
   *
   * Not coalesced: a member holds one open shift at a time, so the sweep closes
   * at most one per person.
   */
  async shiftClosed(data: {
    entryId: string;
    userId: string;
    clockInAt: string;
    clockOutAt: string;
    basis?: string | null;
    timezone?: string | null;
    locationName?: string | null;
  }) {
    const [recipient] = await this.recipients('autoClockOut', [data.userId]);
    if (!recipient) return;
    const confirmUrl = this.link(`/my/attendance?confirm=${encodeURIComponent(data.entryId)}`);
    await this.email.sendToMembers([recipient], (locale) =>
      shiftClosedEmail(locale, {
        userName: recipient.firstName,
        locationName: data.locationName ?? null,
        clockInAt: data.clockInAt,
        clockOutAt: data.clockOutAt,
        timezone: data.timezone ?? null,
        basis: data.basis ?? null,
        confirmUrl,
      }),
    );
  }

  /** An absolute link into the web app. `APP_URL` is the one base every service mails from. */
  link(path: string): string {
    const base = (this.config.get<string>('APP_URL') || 'https://hbcfield.com').replace(/\/+$/, '');
    return `${base}${path}`;
  }
}
