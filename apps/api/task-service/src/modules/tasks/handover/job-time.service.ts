import { Injectable } from '@nestjs/common';
import { TaskEventType } from '@prisma/client';
import {
  NO_JOB_TIME,
  addJobTime,
  exclusiveSpans,
  clockMinutes,
  shiftsWithoutRests,
  joinedJobAt,
  jobWindows,
  jobSpans,
  liveJobKind,
  crewPresence,
  personalSpans,
  selfBlockWindows,
  stepCapabilities,
  stepTimeKind,
  workerJobTime,
  type JobTime,
  type JobTimeKind,
  type ShiftSpan,
  type WorkTimelineEvent,
  TERMINAL_STATUSES,
} from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId } from '../../../common/space-workflow.util';

type TaskRef = { id: string; workflowId: string | null; spaceId: string | null; organizationId: string };
type EventRow = { taskId: string; createdAt: Date; userId: string; eventType: TaskEventType; metadata: unknown };
const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;
const TIME_EVENTS = [TaskEventType.STATUS_CHANGED, TaskEventType.PAUSED, TaskEventType.RESUMED];
/** Taken off the job: who is credited changes there (shared jobWindows). */
const LEAVE_EVENTS = [TaskEventType.UNASSIGNED, TaskEventType.ASSIGNEE_REMOVED];
/** One person's own presence on a crew job (shared crew.ts). */
const CREW_EVENTS = [TaskEventType.CREW_JOINED, TaskEventType.CREW_LEFT, TaskEventType.SELF_BLOCKED, TaskEventType.SELF_RESUMED];
/** A job's history is read whole up to this many rows (newest kept) — years of a daily crew. */
const EVENTS_PER_TASK = 5000;
/** Up to this many jobs are read one query each; more share one query. */
const PER_TASK_READS = 20;
/** Built-in closed steps (shared TERMINAL_STATUSES) — a custom flow's own final step simply counts nothing after it. */
const CLOSED_KEYS: string[] = TERMINAL_STATUSES;

const PERSONAL_KIND: Record<string, WorkTimelineEvent['kind']> = {
  [TaskEventType.CREW_JOINED]: 'JOINED',
  [TaskEventType.CREW_LEFT]: 'LEFT',
  [TaskEventType.SELF_BLOCKED]: 'SELF_BLOCKED',
  [TaskEventType.SELF_RESUMED]: 'SELF_RESUMED',
};

/** What the office wrote on a move it made for somebody — see TasksService.updateStatus. */
type MoveMeta = { newStatus?: string; occurredAt?: string; at?: string; byOffice?: boolean; forUserId?: string; officeReason?: string; reason?: string };

/**
 * Job time (packages/shared/src/tasks/job-time.ts), read from the database:
 * the moments every step already saved, each worker's shifts, and the step
 * kinds of the job's own flow. Nothing is stored, nothing runs in the
 * background — the same answer for the job page, the handover and the report.
 */
@Injectable()
export class JobTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowConfigCache,
  ) {}

  /** How each step of a job counts, from its flow — one lookup per distinct flow per call. */
  private kindsFor(organizationId: string) {
    const spaceFlow = new Map<string, Promise<string | null>>();
    const flows = new Map<string | null, Promise<(s: string) => JobTimeKind | null>>();
    return async (t: Pick<TaskRef, 'workflowId' | 'spaceId'>) => {
      let flowId: string | null = t.workflowId;
      if (!flowId && t.spaceId) {
        if (!spaceFlow.has(t.spaceId)) spaceFlow.set(t.spaceId, resolveSpaceDefaultWorkflowId(this.prisma, t.spaceId));
        flowId = await spaceFlow.get(t.spaceId)!;
      }
      if (!flows.has(flowId)) {
        flows.set(flowId, this.workflows.getWorkflow(organizationId, flowId).then((wf) => (s: string) => stepTimeKind(s, stepCapabilities(wf, s))));
      }
      return flows.get(flowId)!;
    };
  }

  /**
   * Each job's history, as far as its time is concerned — the NEWEST rows when
   * one must be cut. Oldest-first with a cap cut the newest: a long crew job
   * (a join and a clock-out leave per person per day) stopped seeing today's
   * moves after a few weeks. A few jobs (the job page, the pause, the crew) are
   * read one query each so a busy job cannot starve the others; a report over
   * many jobs shares one, newest first.
   */
  private async eventsOf(taskIds: string[]): Promise<Map<string, EventRow[]>> {
    const read = (ids: string[], take: number) =>
      this.prisma.taskEvent.findMany({
        where: { taskId: { in: ids }, eventType: { in: [...TIME_EVENTS, ...LEAVE_EVENTS, ...CREW_EVENTS] } },
        orderBy: { createdAt: 'desc' },
        select: { taskId: true, createdAt: true, userId: true, eventType: true, metadata: true },
        take,
      });
    const rows = !taskIds.length
      ? []
      : taskIds.length <= PER_TASK_READS
        ? (await Promise.all(taskIds.map((id) => read([id], EVENTS_PER_TASK)))).flat()
        : await read(taskIds, 500 * taskIds.length);
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const by = new Map<string, EventRow[]>();
    for (const r of rows) (by.get(r.taskId) ?? by.set(r.taskId, []).get(r.taskId)!).push(r);
    return by;
  }

  private timeline(rows: readonly EventRow[]): WorkTimelineEvent[] {
    return rows.flatMap((e): WorkTimelineEvent[] => {
      if (e.eventType === TaskEventType.UNASSIGNED || e.eventType === TaskEventType.ASSIGNEE_REMOVED) {
        const m = (e.metadata ?? {}) as { previousWorkerId?: string; assigneeId?: string };
        const left = m.previousWorkerId ?? m.assigneeId;
        return left ? [{ at: e.createdAt, userId: left, kind: 'LEFT' }] : [];
      }
      // A crew member's own presence: `userId` is the person, `at` the moment it counts from.
      const personal = PERSONAL_KIND[e.eventType as string];
      if (personal) {
        const m = (e.metadata ?? {}) as { at?: string; reason?: string };
        return [{ at: m.at ?? e.createdAt, userId: e.userId, kind: personal, ...(personal === 'SELF_BLOCKED' ? { reason: m.reason ?? null } : {}) }];
      }
      const m = (e.metadata ?? {}) as MoveMeta;
      return [{
        at: m.occurredAt ?? m.at ?? e.createdAt,
        userId: e.userId,
        kind: e.eventType === TaskEventType.STATUS_CHANGED ? 'STATUS' : e.eventType === TaskEventType.PAUSED ? 'PAUSED' : 'RESUMED',
        status: m.newStatus,
        forUserId: m.forUserId ?? null,
      }];
    });
  }

  /** Several jobs' histories as job time reads them — one query (crew presence, the pause rule). */
  async timelinesOf(taskIds: string[]): Promise<Map<string, WorkTimelineEvent[]>> {
    const events = await this.eventsOf(taskIds);
    return new Map(taskIds.map((id) => [id, this.timeline(events.get(id) ?? [])]));
  }

  /** Everyone's shifts that could overlap [from, to], in one query. */
  private async shiftsOf(userIds: string[], organizationId: string, from: Date | null, to: Date): Promise<Map<string, ShiftSpan[]>> {
    const rows = userIds.length
      ? await this.prisma.timeEntry.findMany({
          where: {
            organizationId,
            userId: { in: userIds },
            clockInAt: { lte: to },
            ...(from ? { OR: [{ clockOutAt: null }, { clockOutAt: { gte: from } }] } : {}),
          },
          select: { userId: true, clockInAt: true, clockOutAt: true, breaks: { select: { startedAt: true, endedAt: true } } },
          orderBy: { clockInAt: 'asc' },
          take: 2000,
        })
      : [];
    const raw = new Map<string, Array<{ start: Date; end: Date | null; rests: Array<{ start: Date; end: Date | null }> }>>();
    for (const r of rows) {
      (raw.get(r.userId) ?? raw.set(r.userId, []).get(r.userId)!).push({
        start: r.clockInAt,
        end: r.clockOutAt,
        rests: r.breaks.map((b) => ({ start: b.startedAt, end: b.endedAt })),
      });
    }
    // On the clock, minus rests — the same spans the "worked" figure is measured on.
    const by = new Map<string, ShiftSpan[]>();
    for (const [id, list] of raw) by.set(id, shiftsWithoutRests(list, to));
    return by;
  }

  /**
   * Who is credited on a job: whoever it is assigned to, and whoever made — or
   * had made for them — a move into time that counts. The office moving a card
   * to Completed is not a worker on it.
   */
  private workersOf(timeline: WorkTimelineEvent[], kindOf: (s: string) => JobTimeKind | null, assigned: string[]): string[] {
    const ids = new Set(assigned);
    for (const e of timeline) if (e.kind === 'JOINED' || e.kind === 'RESUMED' || (e.kind === 'STATUS' && kindOf(e.status ?? ''))) ids.add(e.forUserId ?? e.userId);
    return [...ids];
  }

  /** The first move into counted time, and whether the office made it for somebody. */
  private startedBy(rows: readonly EventRow[], kindOf: (s: string) => JobTimeKind | null) {
    const first = rows.find((e) => e.eventType === TaskEventType.STATUS_CHANGED && kindOf((e.metadata as MoveMeta | null)?.newStatus ?? ''));
    if (!first) return null;
    const m = (first.metadata ?? {}) as MoveMeta;
    return { userId: first.userId, forUserId: m.byOffice ? m.forUserId ?? null : null, reason: m.byOffice ? m.officeReason ?? null : null, at: m.occurredAt ?? first.createdAt.toISOString() };
  }

  /**
   * The jobs a person could have been working on in [from, until]: the ones
   * they are on or moved, that moved in the window or were still open.
   */
  private async workerTasks(userId: string, organizationId: string, from: Date | null, until: Date, include: string[] = []): Promise<Array<TaskRef & { title: string }>> {
    return this.prisma.task.findMany({
      where: {
        organizationId,
        OR: [
          { id: { in: include } },
          {
            OR: [
              { assignedToId: userId },
              { assignees: { some: { userId } } },
              { events: { some: { userId, eventType: { in: TIME_EVENTS } } } },
              { events: { some: { metadata: { path: ['forUserId'], equals: userId } } } },
            ],
            AND: [{
              OR: [
                { events: { some: { eventType: { in: TIME_EVENTS }, createdAt: { ...(from ? { gte: from } : {}), lte: until } } } },
                // Still open: a job in progress since before the window counts inside it.
                { status: { notIn: CLOSED_KEYS } },
              ],
            }],
            createdAt: { lte: until },
          },
        ],
      },
      select: { id: true, title: true, workflowId: true, spaceId: true, organizationId: true },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });
  }

  /**
   * ONE PERSON'S time on each of their jobs, in [from, until] — with
   * `exclusiveSpans` giving every overlapping moment to one job, and only
   * moments on the clock counted. Every figure (job page, handover, clock-out
   * sheet, report) comes through here, so they can never disagree.
   */
  private async timesForWorker(userId: string, organizationId: string, from: Date | null, until: Date, include: string[] = []) {
    const tasks = await this.workerTasks(userId, organizationId, from, until, include);
    const kinds = this.kindsFor(organizationId);
    const events = await this.eventsOf(tasks.map((t) => t.id));
    const jobs = await Promise.all(tasks.map(async (t) => {
      const rows = events.get(t.id) ?? [];
      const timeline = this.timeline(rows);
      const kindOf = await kinds(t);
      return { task: t, rows, timeline, kindOf, spans: jobSpans(timeline, until, kindOf), joinedAt: joinedJobAt(timeline, userId), windows: jobWindows(timeline, userId) };
    }));
    const mine = exclusiveSpans(jobs.map((j) => ({ id: j.task.id, spans: j.spans, windows: j.windows })));
    const earliest = Math.min(...jobs.map((j) => j.joinedAt ?? Infinity));
    const shifts = (await this.shiftsOf([userId], organizationId, from ?? (Number.isFinite(earliest) ? new Date(earliest) : null), until)).get(userId) ?? [];
    const window = from ? { from, to: until } : { to: until };
    const times = new Map<string, JobTime>();
    // Their own stops ("My issue") turn their share blocked; the job's line is untouched.
    for (const j of jobs) {
      const own = personalSpans(mine.get(j.task.id) ?? [], selfBlockWindows(j.timeline, userId));
      times.set(j.task.id, workerJobTime(own, j.joinedAt == null ? null : -Infinity, shifts, window));
    }
    // Still on the clock now: an open shift, read as it was before rests were cut out of it.
    const onClockNow = await this.prisma.timeEntry.count({ where: { organizationId, userId, status: 'CLOCKED_IN' } }) > 0;
    return { jobs, times, shifts, onClockNow };
  }

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
    const workerIds = this.workersOf(timeline, kindOf, [task.assignedToId, ...crew.map((c) => c.userId)].filter((x): x is string => !!x));
    const firstAt = rows[0]?.createdAt ?? null;
    const [shares, people] = await Promise.all([
      Promise.all(workerIds.map((id) => this.timesForWorker(id, task.organizationId, firstAt, until, [task.id]).then((r) => ({ id, ...r })))),
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
    let startedBy = null as null | { user: { id: string; firstName: string; lastName: string } | null; forUser: { id: string; firstName: string; lastName: string } | null; office: boolean; reason: string | null; at: string };
    if (started) {
      const by = names.get(started.userId) ?? (await this.prisma.user.findUnique({ where: { id: started.userId }, ...PERSON }));
      startedBy = { user: by ?? null, forUser: started.forUserId ? names.get(started.forUserId) ?? null : null, office: !!started.forUserId, reason: started.reason, at: started.at };
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
    const { times } = await this.timesForWorker(userId, tasks[0]!.organizationId, null, until, tasks.map((t) => t.id));
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
      const pause = [...evs].reverse().find((e) => e.eventType === TaskEventType.PAUSED && e.userId === userId && inWindow(e.createdAt));
      const block = [...evs].reverse().find((e) => e.eventType === TaskEventType.STATUS_CHANGED && (e.metadata as MoveMeta | null)?.newStatus === 'BLOCKED' && inWindow(e.createdAt));
      return [{
        taskId: t.id,
        title: t.title,
        ...time,
        startedBy: started ? { userId: started.userId, office: !!started.forUserId } : null,
        officeReason: started?.forUserId === userId ? started.reason : null,
        pausedAt: pause ? ((pause.metadata as MoveMeta | null)?.at ?? pause.createdAt.toISOString()) : null,
        blockedReason: block ? ((block.metadata as MoveMeta | null)?.reason ?? null) : null,
      }];
    });
    const people = await this.prisma.user.findMany({ where: { id: { in: [...starters] } }, ...PERSON });
    const names = new Map(people.map((p) => [p.id, p]));
    const totals = rows.reduce<JobTime>((sum, r) => addJobTime(sum, r), NO_JOB_TIME);
    return {
      // On the clock over the period, minus rests — measured on the same spans as job time.
      totals: { ...totals, clock: clockMinutes(shifts, from, until) },
      rows: rows.map((r) => ({ ...r, startedBy: r.startedBy ? { ...r.startedBy, user: names.get(r.startedBy.userId) ?? null } : null })),
    };
  }
}
