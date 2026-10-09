import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { runWithCronLock, TaskStatus, localPartsIn } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';
import { CrewService } from './handover/crew.service';

/** Never the jobs nobody is working: drafts, finished, closed, cancelled. */
const OPEN = { notIn: [TaskStatus.DRAFT, TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED] as string[] };
/** The notice goes out from this local hour — a morning notice, not a midnight one. */
const MORNING_HOUR = 6;

// "Today" and "the hour" where the job is come from the shared zoned-time rule
// (`localPartsIn`), not a formatter built here: one copy, cached, and an unknown
// zone falls back to UTC instead of throwing a RangeError mid-sweep.

/**
 * The morning notice: a job's leader has approved time off today.
 *
 * The job never waits on it — an acting leader stands in automatically
 * (shared crew.ts effectiveLeader) — but the office should know, and choose:
 * keep the stand-in, or pick somebody. Told once per job per day
 * (`Task.leadNoticeOn`), to the leader's own routing (watchers ∪ the space's
 * configured roles — never every admin) and the job's creator.
 *
 * ⚠️ A SWEEP under the cron lease (every replica runs every @Cron), bounded,
 * starting from the few people on leave today rather than the many jobs.
 */
@Injectable()
export class LeaderAbsentService {
  private readonly logger = new Logger(LeaderAbsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
    private readonly crew: CrewService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepCron(): Promise<void> {
    await runWithCronLock(this.prisma, { name: 'task:leaderAbsent', ttlSeconds: 1500, logger: this.logger }, () => this.sweep());
  }

  /** Directly callable, so a test does not have to own a cron lock. */
  async sweep(now: Date = new Date()): Promise<number> {
    // Who is off around today, in any zone: one indexed query on approved leave.
    const dayMs = 86_400_000;
    const leave = await this.prisma.timeOff.findMany({
      where: { status: 'APPROVED', startDate: { lte: new Date(now.getTime() + dayMs) }, endDate: { gte: new Date(now.getTime() - dayMs) } },
      select: { technicianId: true, startDate: true, endDate: true },
      take: 2000,
    });
    if (!leave.length) return 0;
    const offBy = new Map<string, Array<{ from: string; to: string }>>();
    for (const l of leave) {
      (offBy.get(l.technicianId) ?? offBy.set(l.technicianId, []).get(l.technicianId)!).push({
        from: l.startDate.toISOString().slice(0, 10),
        to: l.endDate.toISOString().slice(0, 10),
      });
    }

    const jobs = await this.prisma.task.findMany({
      where: {
        assignedToId: { in: [...offBy.keys()] },
        status: OPEN,
        // Today's work, or work already under way.
        OR: [
          { dueDate: { gte: new Date(now.getTime() - dayMs), lte: new Date(now.getTime() + dayMs) } },
          { pausedAt: { not: null } },
          { status: { in: [TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] } },
        ],
      },
      select: {
        id: true, title: true, organizationId: true, assignedToId: true, createdById: true, leadNoticeOn: true,
        space: { select: { timezone: true } },
        organization: { select: { timezone: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
      // Soonest first, so a very busy day never leaves today's jobs out.
      orderBy: { dueDate: 'asc' },
      take: 500,
    });

    let sent = 0;
    for (const job of jobs) {
      const tz = job.space?.timezone || job.organization?.timezone || 'UTC';
      const { dateStr: today, minutesOfDay } = localPartsIn(now, tz);
      if (job.leadNoticeOn === today || minutesOfDay < MORNING_HOUR * 60) continue;
      if (!(offBy.get(job.assignedToId!) ?? []).some((r) => r.from <= today && today <= r.to)) continue;

      // Claim the day first: two replicas, or a slow send, never tell the office twice.
      const claimed = await this.prisma.task.updateMany({
        where: { id: job.id, OR: [{ leadNoticeOn: null }, { leadNoticeOn: { not: today } }] },
        data: { leadNoticeOn: today },
      });
      if (claimed.count === 0) continue;

      const [watchers, view] = await Promise.all([
        this.routing.resolveWatchers(job.assignedToId!, job.organizationId, 'tasks'),
        this.crew.viewFor(job.id),
      ]);
      /*
        ⚠️ The creator only when they are STAFF. A portal client or an external
        observer can create a job; the leave of somebody who works here is not
        theirs to hear.
      */
      const creator = job.createdById
        ? await this.prisma.user.findFirst({
            where: { id: job.createdById, organizationId: job.organizationId, isExternal: false, isActive: true, role: { not: 'CUSTOMER' } },
            select: { id: true },
          })
        : null;
      const recipients = [...new Set([...watchers.ids, ...(creator ? [creator.id] : [])])].filter((id) => id !== job.assignedToId);
      if (!recipients.length) continue;
      const acting = view?.leader.acting ? view.members.find((m) => m.user.id === view.leader.userId)?.user : null;
      this.notifications.emit('task_lead_needed', {
        taskId: job.id,
        taskTitle: job.title,
        recipientIds: recipients,
        leaderName: job.assignedTo ? `${job.assignedTo.firstName} ${job.assignedTo.lastName}`.trim() : '',
        actingName: acting ? `${acting.firstName} ${acting.lastName}`.trim() : null,
      });
      sent++;
    }
    if (sent) this.logger.log(`Leader-absent notices: ${sent}`);
    return sent;
  }
}
