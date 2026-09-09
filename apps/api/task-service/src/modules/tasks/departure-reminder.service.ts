import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  runWithCronLock,
  haversineDistance,
  straightLineTravel,
  leaveAtFor,
  hasAppointmentTime,
  tzOffsetMs,
  TaskStatus,
} from '@hbcfield/shared';

/**
 * Telling somebody to set off, while their phone is in their pocket.
 *
 * The card on the task screen already counts down, but a member reading a task
 * screen is a member who has remembered. The whole value of an appointment time
 * is the nudge that arrives when they have not.
 *
 * ⚠️ Runs on a SWEEP, not on a delayed job scheduled at creation. A "leave at
 * 12:13" job queued days ahead is computed from an origin that is a guess, and
 * it goes stale the moment the member is somewhere else that morning, the due
 * date moves, or the task is reassigned. Asking "who should be leaving in the
 * next few minutes" every few minutes is self-correcting and costs one indexed
 * query.
 */
@Injectable()
export class DepartureReminderService {
  private readonly logger = new Logger(DepartureReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * How far ahead of the departure moment to speak.
   *
   * Slightly wider than the sweep interval on purpose: at exactly 5 the two
   * would race and a member whose moment fell between ticks would be told to
   * leave a minute late, every time.
   */
  private static readonly LEAD_MINUTES = 7;

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweepCron(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'task:departureReminders', ttlSeconds: 240, logger: this.logger },
      () => this.sweep(),
    );
  }

  /** Directly callable, so a test does not have to own a cron lock. */
  async sweep(now: Date = new Date()): Promise<number> {
    /*
      The candidate set, narrowed in the database rather than in memory.

      Bounded to the next twelve hours because a departure is at most a
      day's drive away and an unbounded scan would grow with the table for
      ever. `departureNotifiedAt: null` is the partial index this rides on.
    */
    const horizon = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const candidates = await this.prisma.task.findMany({
      where: {
        departureNotifiedAt: null,
        assignedToId: { not: null },
        dueDate: { gt: now, lte: horizon },
        locationLat: { not: null },
        locationLng: { not: null },
        // Only work not yet under way. Somebody already driving does not need
        // telling to drive, and a finished job certainly does not.
        status: { in: [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED, TaskStatus.NEW] },
      },
      select: {
        id: true, title: true, dueDate: true, assignedToId: true,
        locationLat: true, locationLng: true, organizationId: true,
        space: { select: { timezone: true } },
      },
      // A backstop, not a limit anybody should reach: if this ever truncates,
      // the next tick five minutes later picks up the rest.
      take: 200,
    });
    if (candidates.length === 0) return 0;

    /*
      Where each member was last seen, in ONE query rather than one per task.
      A member with several jobs today is the normal case, not the exception.
    */
    const userIds = Array.from(new Set(candidates.map((t) => t.assignedToId!)));
    const positions = await this.prisma.workerLastLocation.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, lat: true, lng: true, updatedAt: true },
    });
    const whereTheyAre = new Map(positions.map((p) => [p.userId, p]));

    let sent = 0;
    for (const task of candidates) {
      const due = task.dueDate!;
      const offsetMinutes = tzOffsetMs(now, task.space?.timezone || 'UTC') / 60_000;

      // A dated-only job has no departure to announce. Midnight IS that value.
      if (!hasAppointmentTime(due, offsetMinutes)) continue;

      const at = whereTheyAre.get(task.assignedToId!);
      /*
        No known position means no estimate, and an estimate is the entire
        message. Staying silent is right: "leave now" with a made-up drive time
        is worse than nothing, and the countdown on the task screen still works
        from the phone's own GPS.
      */
      if (!at) continue;

      const travel = straightLineTravel(
        haversineDistance(at.lat, at.lng, task.locationLat!, task.locationLng!),
      );
      const leaveAt = leaveAtFor(due, travel.seconds);
      const minutesUntil = (leaveAt.getTime() - now.getTime()) / 60_000;
      if (minutesUntil > DepartureReminderService.LEAD_MINUTES) continue;

      /*
        Claim it BEFORE announcing it.

        The cron lock makes a second replica unlikely, not impossible — a lock
        that expires mid-sweep would otherwise let two replicas tell the same
        person to leave twice. `updateMany` with the null check is the claim:
        whoever's write matches first is the one that speaks.
      */
      const claimed = await this.prisma.task.updateMany({
        where: { id: task.id, departureNotifiedAt: null },
        data: { departureNotifiedAt: now },
      });
      if (claimed.count === 0) continue;

      this.notificationClient.emit('task_departure_due', {
        taskId: task.id,
        title: task.title,
        userId: task.assignedToId,
        organizationId: task.organizationId,
        dueDate: due.toISOString(),
        leaveAt: leaveAt.toISOString(),
        travelMinutes: Math.round(travel.seconds / 60),
        // Said plainly, because the phone shows it: this is a straight-line guess.
        estimated: travel.source === 'straight-line',
      });
      sent += 1;
    }

    if (sent > 0) this.logger.log(`Departure reminders sent: ${sent}`);
    return sent;
  }
}
