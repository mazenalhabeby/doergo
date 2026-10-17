import { Injectable } from '@nestjs/common';
import { TaskEventType } from '@prisma/client';
import {
  NO_JOB_TIME,
  addJobTime,
  clockMinutes,
  jobSpans,
  liveJobKind,
  crewPresence,
  type JobTime,
} from '@hbcfield/shared';
import { TaskRef, PERSON, MoveMeta } from './job-time-helpers';
import { JobTimeBase } from './job-time.base';

/**
 * Job time (packages/shared/src/tasks/job-time.ts), read from the database:
 * the moments every step already saved, each worker's shifts, and the step
 * kinds of the job's own flow. Nothing is stored, nothing runs in the
 * background — the same answer for the job page, the handover and the report.
 */
@Injectable()
export class JobTimeService extends JobTimeBase {
  /** One job: the total, each worker's share, and what is running now. */
  async forTask(task: TaskRef & { assignedToId: string | null }, until: Date = new Date()) {
    const [kindOf, events, crew] = await Promise.all([
      this.kindsFor(task.organizationId)(task),
      this.eventsOf([task.id]),
      this.prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } }),
    ]);
    const rows = events.get(task.id) ?? [];
    const timeline = this.timeline(rows);
    const spans = jobSpans(timeline, until, kindOf);
    const workerIds = this.workersOf(
      timeline,
      kindOf,
      [task.assignedToId, ...crew.map((c) => c.userId)].filter((x): x is string => !!x),
    );
    const firstAt = rows[0]?.createdAt ?? null;
    const [shares, people] = await Promise.all([
      Promise.all(
        workerIds.map((id) =>
          this.timesForWorker(id, task.organizationId, firstAt, until, [task.id]).then((r) => ({ id, ...r })),
        ),
      ),
      this.prisma.user.findMany({ where: { id: { in: workerIds } }, ...PERSON }),
    ]);
    const byId = new Map(shares.map((s) => [s.id, s]));
    const liveKind = liveJobKind(spans, until);
    const presence = crewPresence(timeline, workerIds);
    // What each person's time is running as NOW: on the clock, on the job, and their own stop makes it blocked.
    const liveOf = (id: string) => {
      const p = presence.get(id);
      if (!liveKind || !p?.joined || !byId.get(id)?.onClockNow) return null;
      return p.selfBlockedSince != null ? ('blocked' as const) : liveKind;
    };
    const byWorker = people
      .map((p) => ({ user: p, ...(byId.get(p.id)?.times.get(task.id) ?? NO_JOB_TIME), live: liveOf(p.id) }))
      .filter((w) => w.travel + w.working + w.blocked > 0 || w.live);
    const total = byWorker.reduce<JobTime>((sum, w) => addJobTime(sum, w), NO_JOB_TIME);
    // Ticking on a screen only while somebody counted on it is on the clock.
    const onClock = byWorker.filter((w) => w.live).length;
    const started = this.startedBy(rows, kindOf);
    const names = new Map(people.map((p) => [p.id, p]));
    let startedBy = null as null | {
      user: { id: string; firstName: string; lastName: string } | null;
      forUser: { id: string; firstName: string; lastName: string } | null;
      office: boolean;
      reason: string | null;
      at: string;
    };
    if (started) {
      const by =
        names.get(started.userId) ?? (await this.prisma.user.findUnique({ where: { id: started.userId }, ...PERSON }));
      startedBy = {
        user: by ?? null,
        forUser: started.forUserId ? (names.get(started.forUserId) ?? null) : null,
        office: !!started.forUserId,
        reason: started.reason,
        at: started.at,
      };
    }
    return {
      asOf: until.toISOString(),
      total,
      byWorker,
      live: liveKind && onClock ? { kind: liveKind, workers: onClock } : null,
      startedBy,
    };
  }

  /** One worker's working minutes on a job up to `until` — what a pause records. */
  async workedFor(task: TaskRef, userId: string, until: Date): Promise<number> {
    const { times } = await this.timesForWorker(userId, task.organizationId, null, until, [task.id]);
    return times.get(task.id)?.working ?? 0;
  }

  /** Several jobs for one worker, up to now — the clock-out sheet and the "so far" on a paused job. */
  async workedForMany(tasks: TaskRef[], userId: string, until: Date = new Date()): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!tasks.length) return out;
    const { times } = await this.timesForWorker(
      userId,
      tasks[0]!.organizationId,
      null,
      until,
      tasks.map((t) => t.id),
    );
    for (const t of tasks) out.set(t.id, times.get(t.id)?.working ?? 0);
    return out;
  }

  /**
   * One worker's job time over a period: what each job took, who started it,
   * and the time on the clock to set it against. Clipped to the period.
   */
  async report(data: { userId: string; organizationId: string; from: Date; to: Date }) {
    const { userId, organizationId, from, to } = data;
    const until = new Date(Math.min(to.getTime(), Date.now()));
    const { jobs, times, shifts } = await this.timesForWorker(userId, organizationId, from, until);
    const starters = new Set<string>();
    const inWindow = (d: Date) => d >= from && d <= to;
    const rows = jobs.flatMap(({ task: t, rows: evs, kindOf }) => {
      const time = times.get(t.id) ?? NO_JOB_TIME;
      if (time.travel + time.working + time.blocked === 0) return [];
      const started = this.startedBy(evs, kindOf);
      if (started) starters.add(started.userId);
      const pause = [...evs]
        .reverse()
        .find((e) => e.eventType === TaskEventType.PAUSED && e.userId === userId && inWindow(e.createdAt));
      const block = [...evs]
        .reverse()
        .find(
          (e) =>
            e.eventType === TaskEventType.STATUS_CHANGED &&
            (e.metadata as MoveMeta | null)?.newStatus === 'BLOCKED' &&
            inWindow(e.createdAt),
        );
      return [
        {
          taskId: t.id,
          title: t.title,
          ...time,
          startedBy: started ? { userId: started.userId, office: !!started.forUserId } : null,
          officeReason: started?.forUserId === userId ? started.reason : null,
          pausedAt: pause ? ((pause.metadata as MoveMeta | null)?.at ?? pause.createdAt.toISOString()) : null,
          blockedReason: block ? ((block.metadata as MoveMeta | null)?.reason ?? null) : null,
        },
      ];
    });
    const people = await this.prisma.user.findMany({ where: { id: { in: [...starters] } }, ...PERSON });
    const names = new Map(people.map((p) => [p.id, p]));
    const totals = rows.reduce<JobTime>((sum, r) => addJobTime(sum, r), NO_JOB_TIME);
    return {
      // On the clock over the period, minus rests — measured on the same spans as job time.
      totals: { ...totals, clock: clockMinutes(shifts, from, until) },
      rows: rows.map((r) => ({
        ...r,
        startedBy: r.startedBy ? { ...r.startedBy, user: names.get(r.startedBy.userId) ?? null } : null,
      })),
    };
  }
}
