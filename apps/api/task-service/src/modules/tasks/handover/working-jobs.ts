import { crewPresence, pausesAtClockOut, stepCapabilities, stepStartsWork } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache, type CachedWorkflow } from '../../workflows/config-cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowIds } from '../../workflows/space-workflow.util';
import { JobTimeService } from './job-time.service';
import { NEVER_WORKING, Candidate } from './job-pause-helpers';

/*
  The jobs a person is working on, who else is on them, and whether the crew
  carries on — read by the pause at clock-out and by the member's own picture.
*/

/** What finding the jobs in work needs: the database and the per-organization workflow cache. */
export type WorkingJobsDeps = { prisma: PrismaService; workflows: WorkflowConfigCache };

/**
 * The jobs this person is working right now: on the job (lead or crew), in a
 * step where work runs, not paused. What the clock-out sheet lists, and what
 * the clock-out pauses.
 */
export async function workingJobsOf(
  { prisma, workflows }: WorkingJobsDeps,
  userId: string,
  organizationId: string,
  opts: { includePaused?: boolean; taskId?: string } = {},
): Promise<Candidate[]> {
  const rows = await prisma.task.findMany({
    where: {
      ...(opts.taskId ? { id: opts.taskId } : {}),
      organizationId,
      status: { notIn: NEVER_WORKING },
      ...(opts.includePaused ? {} : { pausedAt: null }),
      OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
    },
    select: {
      id: true,
      title: true,
      status: true,
      workflowId: true,
      spaceId: true,
      organizationId: true,
      assignedToId: true,
      pausedAt: true,
    },
    /*
      ⚠️ Newest first. A person can sit on more than 50 jobs that never finished (old ones left
      blocked); unordered, the job they are working on NOW fell outside the 50 — the clock-out
      paused nothing and the last one out of a crew left it running.
    */
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  if (rows.length === 0) return [];

  // One workflow lookup per distinct flow, from the per-org cache; every space's default in one batch.
  const spaceFlow = await resolveSpaceDefaultWorkflowIds(
    prisma,
    rows.filter((r) => !r.workflowId).map((r) => r.spaceId),
  );
  const flowOf = async (r: Candidate) => r.workflowId ?? (r.spaceId ? (spaceFlow.get(r.spaceId) ?? null) : null);
  const flows = new Map<string | null, Promise<CachedWorkflow | null>>();
  const working = await Promise.all(
    rows.map(async (r) => {
      const flowId = await flowOf(r);
      if (!flows.has(flowId)) flows.set(flowId, workflows.getWorkflow(organizationId, flowId));
      const wf = await flows.get(flowId);
      return stepStartsWork(r.status, stepCapabilities(wf, r.status)) ? r : null;
    }),
  );
  return working.filter((r): r is Candidate => !!r);
}

/**
 * Who has joined each of these jobs (the CREW only), and which of the others
 * are on the clock — one history read, one assignee read, one clock read.
 *
 * ⚠️ THE CREW, not everybody in the history: a dispatcher dragging the card
 * on the board is a STATUS event too, and must never keep a job running.
 */
export async function crewOnJobs(
  prisma: PrismaService,
  jobTime: JobTimeService,
  jobs: Candidate[],
  userId: string,
  organizationId: string,
) {
  const [timelines, rows] = await Promise.all([
    jobTime.timelinesOf(jobs.map((j) => j.id)),
    jobs.length
      ? prisma.taskAssignee.findMany({
          where: { taskId: { in: jobs.map((j) => j.id) } },
          select: { taskId: true, userId: true },
        })
      : Promise.resolve([] as Array<{ taskId: string; userId: string }>),
  ]);
  const crewOf = new Map(
    jobs.map((j) => [
      j.id,
      new Set(
        [j.assignedToId, ...rows.filter((r) => r.taskId === j.id).map((r) => r.userId)].filter((x): x is string => !!x),
      ),
    ]),
  );
  const joinedOf = new Map(
    jobs.map((j) => {
      const people = [...(crewOf.get(j.id) ?? [])];
      return [
        j.id,
        [...crewPresence(timelines.get(j.id) ?? [], people)].filter(([, p]) => p.joined).map(([id]) => id),
      ] as const;
    }),
  );
  const others = [...new Set([...joinedOf.values()].flat().filter((id) => id !== userId))];
  const onClock = new Set(
    others.length
      ? (
          await prisma.timeEntry.findMany({
            where: { organizationId, userId: { in: others }, status: 'CLOCKED_IN' },
            select: { userId: true },
          })
        ).map((e) => e.userId)
      : [],
  );
  return { joinedOf, onClock };
}

/** The jobs that keep running after this person clocks out — somebody else who joined is still on the clock. */
export async function crewCarriesOn(
  prisma: PrismaService,
  jobTime: JobTimeService,
  jobs: Candidate[],
  userId: string,
  organizationId: string,
): Promise<Set<string>> {
  if (!jobs.length) return new Set();
  const { joinedOf, onClock } = await crewOnJobs(prisma, jobTime, jobs, userId, organizationId);
  return new Set(
    jobs
      .filter((j) => !pausesAtClockOut({ leaverId: userId, joined: joinedOf.get(j.id) ?? [], onClock }))
      .map((j) => j.id),
  );
}
