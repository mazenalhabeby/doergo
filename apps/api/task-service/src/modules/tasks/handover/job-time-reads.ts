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
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId, resolveSpaceDefaultWorkflowIds } from '../../workflows/space-workflow.util';
import {
  TaskRef,
  EventRow,
  TIME_EVENTS,
  LEAVE_EVENTS,
  CREW_EVENTS,
  EVENTS_PER_TASK,
  PER_TASK_READS,
  CLOSED_KEYS,
} from './job-time-helpers';
import { jobTimeline } from './job-timeline';

/** What reading job time needs: the database and the per-organization workflow cache. */
export type JobTimeDeps = { prisma: PrismaService; workflows: WorkflowConfigCache };

/**
 * How each step of a job counts, from its flow — one lookup per distinct flow per call.
 * `spaces`: the spaces about to be asked, resolved in one batch instead of one query each.
 */
export function stepKindsFor(
  { prisma, workflows }: JobTimeDeps,
  organizationId: string,
  spaces?: Iterable<string | null | undefined>,
) {
  const spaceFlow = new Map<string, Promise<string | null>>();
  const asked = [...new Set(spaces ?? [])].filter((id): id is string => !!id);
  if (asked.length) {
    const batch = resolveSpaceDefaultWorkflowIds(prisma, asked);
    for (const id of asked)
      spaceFlow.set(
        id,
        batch.then((m) => m.get(id) ?? null),
      );
  }
  const flows = new Map<string | null, Promise<(s: string) => JobTimeKind | null>>();
  return async (t: Pick<TaskRef, 'workflowId' | 'spaceId'>) => {
    let flowId: string | null = t.workflowId;
    if (!flowId && t.spaceId) {
      if (!spaceFlow.has(t.spaceId)) spaceFlow.set(t.spaceId, resolveSpaceDefaultWorkflowId(prisma, t.spaceId));
      flowId = await spaceFlow.get(t.spaceId)!;
    }
    if (!flows.has(flowId)) {
      flows.set(
        flowId,
        workflows
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
export async function jobEventsOf(prisma: PrismaService, taskIds: string[]): Promise<Map<string, EventRow[]>> {
  const read = (ids: string[], take: number) =>
    prisma.taskEvent.findMany({
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

/** Everyone's shifts that could overlap [from, to], in one query. */
async function shiftsOf(
  prisma: PrismaService,
  userIds: string[],
  organizationId: string,
  from: Date | null,
  to: Date,
): Promise<Map<string, ShiftSpan[]>> {
  const rows = userIds.length
    ? await prisma.timeEntry.findMany({
        where: {
          organizationId,
          userId: { in: userIds },
          clockInAt: { lte: to },
          ...(from ? { OR: [{ clockOutAt: null }, { clockOutAt: { gte: from } }] } : {}),
        },
        select: {
          userId: true,
          clockInAt: true,
          clockOutAt: true,
          breaks: { select: { startedAt: true, endedAt: true } },
        },
        orderBy: { clockInAt: 'asc' },
        take: 2000,
      })
    : [];
  type RawShift = { start: Date; end: Date | null; rests: Array<{ start: Date; end: Date | null }> };
  const raw = new Map<string, RawShift[]>();
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
 * The jobs a person could have been working on in [from, until]: the ones
 * they are on or moved, that moved in the window or were still open.
 */
function workerTasks(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
  from: Date | null,
  until: Date,
  include: string[] = [],
): Promise<Array<TaskRef & { title: string }>> {
  return prisma.task.findMany({
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
          AND: [
            {
              OR: [
                {
                  events: {
                    some: { eventType: { in: TIME_EVENTS }, createdAt: { ...(from ? { gte: from } : {}), lte: until } },
                  },
                },
                // Still open: a job in progress since before the window counts inside it.
                { status: { notIn: CLOSED_KEYS } },
              ],
            },
          ],
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
export async function timesForWorker(
  deps: JobTimeDeps,
  userId: string,
  organizationId: string,
  from: Date | null,
  until: Date,
  include: string[] = [],
) {
  const { prisma } = deps;
  const tasks = await workerTasks(prisma, userId, organizationId, from, until, include);
  const kinds = stepKindsFor(
    deps,
    organizationId,
    tasks.filter((t) => !t.workflowId).map((t) => t.spaceId),
  );
  const events = await jobEventsOf(
    prisma,
    tasks.map((t) => t.id),
  );
  const jobs = await Promise.all(
    tasks.map(async (t) => {
      const rows = events.get(t.id) ?? [];
      const timeline = jobTimeline(rows);
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
  const shiftFrom = from ?? (Number.isFinite(earliest) ? new Date(earliest) : null);
  const shifts = (await shiftsOf(prisma, [userId], organizationId, shiftFrom, until)).get(userId) ?? [];
  const window = from ? { from, to: until } : { to: until };
  const times = new Map<string, JobTime>();
  // Their own stops ("My issue") turn their share blocked; the job's line is untouched.
  for (const j of jobs) {
    const own = personalSpans(mine.get(j.task.id) ?? [], selfBlockWindows(j.timeline, userId));
    times.set(j.task.id, workerJobTime(own, j.joinedAt == null ? null : -Infinity, shifts, window));
  }
  // Still on the clock now: an open shift, read as it was before rests were cut out of it.
  const onClockNow = (await prisma.timeEntry.count({ where: { organizationId, userId, status: 'CLOCKED_IN' } })) > 0;
  return { jobs, times, shifts, onClockNow };
}
