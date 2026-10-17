import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { crewPresence, pausesAtClockOut, stepCapabilities, stepStartsWork } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache, type CachedWorkflow } from '../../../common/cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowIds } from '../../../common/space-workflow.util';
import { JobTimeService } from './job-time.service';
import { NEVER_WORKING, Candidate } from './job-pause-helpers';

/**
 * What pausing and reading paused jobs share: the jobs a person is working on, who
 * else is on them, and whether the crew carries on.
 */
@Injectable()
export abstract class JobPauseBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly workflows: WorkflowConfigCache,
    @Inject('NOTIFICATION_SERVICE') protected readonly notifications: ClientProxy,
    // The one job-time rule — the pause records what it says the worker put in.
    protected readonly jobTime: JobTimeService,
  ) {}

  /**
   * The jobs this person is working right now: on the job (lead or crew), in a
   * step where work runs, not paused. What the clock-out sheet lists, and what
   * the clock-out pauses.
   */
  async workingJobsOf(
    userId: string,
    organizationId: string,
    opts: { includePaused?: boolean } = {},
  ): Promise<Candidate[]> {
    const rows = await this.prisma.task.findMany({
      where: {
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
      take: 50,
    });
    if (rows.length === 0) return [];

    // One workflow lookup per distinct flow, from the per-org cache; every space's default in one batch.
    const spaceFlow = await resolveSpaceDefaultWorkflowIds(
      this.prisma,
      rows.filter((r) => !r.workflowId).map((r) => r.spaceId),
    );
    const flowOf = async (r: Candidate) => r.workflowId ?? (r.spaceId ? (spaceFlow.get(r.spaceId) ?? null) : null);
    const flows = new Map<string | null, Promise<CachedWorkflow | null>>();
    const working = await Promise.all(
      rows.map(async (r) => {
        const flowId = await flowOf(r);
        if (!flows.has(flowId)) flows.set(flowId, this.workflows.getWorkflow(organizationId, flowId));
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
  protected async crewOnJobs(jobs: Candidate[], userId: string, organizationId: string) {
    const [timelines, rows] = await Promise.all([
      this.jobTime.timelinesOf(jobs.map((j) => j.id)),
      jobs.length
        ? this.prisma.taskAssignee.findMany({
            where: { taskId: { in: jobs.map((j) => j.id) } },
            select: { taskId: true, userId: true },
          })
        : Promise.resolve([] as Array<{ taskId: string; userId: string }>),
    ]);
    const crewOf = new Map(
      jobs.map((j) => [
        j.id,
        new Set(
          [j.assignedToId, ...rows.filter((r) => r.taskId === j.id).map((r) => r.userId)].filter(
            (x): x is string => !!x,
          ),
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
            await this.prisma.timeEntry.findMany({
              where: { organizationId, userId: { in: others }, status: 'CLOCKED_IN' },
              select: { userId: true },
            })
          ).map((e) => e.userId)
        : [],
    );
    return { joinedOf, onClock };
  }

  /** The jobs that keep running after this person clocks out — somebody else who joined is still on the clock. */
  protected async crewCarriesOn(jobs: Candidate[], userId: string, organizationId: string): Promise<Set<string>> {
    if (!jobs.length) return new Set();
    const { joinedOf, onClock } = await this.crewOnJobs(jobs, userId, organizationId);
    return new Set(
      jobs
        .filter((j) => !pausesAtClockOut({ leaverId: userId, joined: joinedOf.get(j.id) ?? [], onClock }))
        .map((j) => j.id),
    );
  }
}
