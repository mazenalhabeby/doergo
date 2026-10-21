import { Injectable } from '@nestjs/common';
import { TaskEventType } from '@prisma/client';
import {
  exclusiveSpans,
  shiftsWithoutRests,
  joinedJobAt,
  jobWindows,
  jobSpans,
  personalSpans,
  selfBlockWindows,
  stepCapabilities,
  stepTimeKind,
  workerJobTime,
  type JobTime,
  type JobTimeKind,
  type ShiftSpan,
  type WorkTimelineEvent,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId, resolveSpaceDefaultWorkflowIds } from '../../../common/space-workflow.util';
import {
  TaskRef,
  EventRow,
  TIME_EVENTS,
  LEAVE_EVENTS,
  CREW_EVENTS,
  EVENTS_PER_TASK,
  PER_TASK_READS,
  CLOSED_KEYS,
  PERSONAL_KIND,
  MoveMeta,
} from './job-time-helpers';

/**
 * Reading what job time is made of: the kinds of time per step, each job's events,
 * its timeline, the shifts, the workers, who started it, and one worker's time.
 */
@Injectable()
export abstract class JobTimeBase {

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly workflows: WorkflowConfigCache,
  ) {}


  /**
   * How each step of a job counts, from its flow — one lookup per distinct flow per call.
   * `spaces`: the spaces about to be asked, resolved in one batch instead of one query each.
   */
  protected kindsFor(organizationId: string, spaces?: Iterable<string | null | undefined>) {
    const spaceFlow = new Map<string, Promise<string | null>>();
    const asked = [...new Set(spaces ?? [])].filter((id): id is string => !!id);
    if (asked.length) {
      const batch = resolveSpaceDefaultWorkflowIds(this.prisma, asked);
      for (const id of asked) spaceFlow.set(id, batch.then((m) => m.get(id) ?? null));
    }
    const flows = new Map<string | null, Promise<(s: string) => JobTimeKind | null>>();
    return async (t: Pick<TaskRef, 'workflowId' | 'spaceId'>) => {
      let flowId: string | null = t.workflowId;
      if (!flowId && t.spaceId) {
        if (!spaceFlow.has(t.spaceId)) spaceFlow.set(t.spaceId, resolveSpaceDefaultWorkflowId(this.prisma, t.spaceId));
        flowId = await spaceFlow.get(t.spaceId)!;
      }
      if (!flows.has(flowId)) {
        flows.set(
          flowId,
          this.workflows
            .getWorkflow(organizationId, flowId)
            .then((wf) => (s: string) => stepTimeKind(s, stepCapabilities(wf, s))),
        );
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
  protected async eventsOf(taskIds: string[]): Promise<Map<string, EventRow[]>> {
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

  protected timeline(rows: readonly EventRow[]): WorkTimelineEvent[] {
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
        return [
          {
            at: m.at ?? e.createdAt,
            userId: e.userId,
            kind: personal,
            ...(personal === 'SELF_BLOCKED' ? { reason: m.reason ?? null } : {}),
          },
        ];
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
  protected async shiftsOf(userIds: string[], organizationId: string, from: Date | null, to: Date): Promise<Map<string, ShiftSpan[]>> {
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
  protected workersOf(timeline: WorkTimelineEvent[], kindOf: (s: string) => JobTimeKind | null, assigned: string[]): string[] {
    const ids = new Set(assigned);
    for (const e of timeline)
      if (e.kind === 'JOINED' || e.kind === 'RESUMED' || (e.kind === 'STATUS' && kindOf(e.status ?? '')))
        ids.add(e.forUserId ?? e.userId);
    return [...ids];
  }

  /** The first move into counted time, and whether the office made it for somebody. */
  protected startedBy(rows: readonly EventRow[], kindOf: (s: string) => JobTimeKind | null) {
    const first = rows.find(
      (e) => e.eventType === TaskEventType.STATUS_CHANGED && kindOf((e.metadata as MoveMeta | null)?.newStatus ?? ''),
    );
    if (!first) return null;
    const m = (first.metadata ?? {}) as MoveMeta;
    return {
      userId: first.userId,
      forUserId: m.byOffice ? (m.forUserId ?? null) : null,
      reason: m.byOffice ? (m.officeReason ?? null) : null,
      at: m.occurredAt ?? first.createdAt.toISOString(),
    };
  }

  /**
   * The jobs a person could have been working on in [from, until]: the ones
   * they are on or moved, that moved in the window or were still open.
   */
  protected async workerTasks(
    userId: string,
    organizationId: string,
    from: Date | null,
    until: Date,
    include: string[] = [],
  ): Promise<Array<TaskRef & { title: string }>> {
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
  protected async timesForWorker(userId: string, organizationId: string, from: Date | null, until: Date, include: string[] = []) {
    const tasks = await this.workerTasks(userId, organizationId, from, until, include);
    const kinds = this.kindsFor(organizationId, tasks.filter((t) => !t.workflowId).map((t) => t.spaceId));
    const events = await this.eventsOf(tasks.map((t) => t.id));
    const jobs = await Promise.all(
      tasks.map(async (t) => {
        const rows = events.get(t.id) ?? [];
        const timeline = this.timeline(rows);
        const kindOf = await kinds(t);
        return {
          task: t,
          rows,
          timeline,
          kindOf,
          spans: jobSpans(timeline, until, kindOf),
          joinedAt: joinedJobAt(timeline, userId),
          windows: jobWindows(timeline, userId),
        };
      }),
    );
    const mine = exclusiveSpans(jobs.map((j) => ({ id: j.task.id, spans: j.spans, windows: j.windows })));
    const earliest = Math.min(...jobs.map((j) => j.joinedAt ?? Infinity));
    const shifts =
      (
        await this.shiftsOf(
          [userId],
          organizationId,
          from ?? (Number.isFinite(earliest) ? new Date(earliest) : null),
          until,
        )
      ).get(userId) ?? [];
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
}
