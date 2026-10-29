import { Injectable, NotFoundException } from '@nestjs/common';
import {
  zoneOf,
  Role,
  accessAllowsInSpace,
  crewPresence,
  effectiveLeader,
  stepCapabilities,
  stepTimeKind,
  type EffectiveLeader,
  type WorkTimelineEvent,
  personNameById,
  assertFoundInOrg,
  orgTimezone,
  orgCrewMode,
  peopleFaces,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId } from '../../workflows/space-workflow.util';
import { JobTimeService } from './job-time.service';
import { TaskAccessService } from '../access/task-access.service';
import { CrewActor, CrewTask, TASK_SELECT } from './crew-helpers';

/**
 * Reading a crew: the task (as the caller may see it), who is on it, who is on the
 * clock, the kind of time, the leader, the office, names and the zone, and the
 * crew as the screens show it. Every crew action reads through here, so they
 * all read the crew the same way.
 */
@Injectable()
export class CrewReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowConfigCache,
    private readonly jobTime: JobTimeService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  // ─────────────────────────── reads ───────────────────────────

  /** A job of the caller's organization, or 404. Crew actions never reach across organizations. */
  async taskOf(taskId: string, organizationId: string): Promise<CrewTask> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    assertFoundInOrg(task, organizationId, 'Task');
    return task;
  }

  /**
   * A job the caller may SEE, or 404 — the crew routes' door.
   *
   * Being in the organization was the whole check, so a member probing a job
   * id they cannot open was answered 400 NOT_ON_CREW ("They are not on this
   * job") — which confirms the job exists and says who is not on it. The task
   * gate (TaskAccessService, the one rule for every task read) is asked first
   * — or the office's assign authority in the job's workspace, which acts on
   * crews by definition: neither → 404, the same as the task page. Only a caller who can see
   * the job gets the crew rules' 400 codes, which they can act on.
   */
  async visibleTaskOf(taskId: string, actor: CrewActor): Promise<CrewTask> {
    const task = await this.taskOf(taskId, actor.organizationId);
    // The office with assign rights over this job's workspace may act on its
    // crew (put somebody on, hand the lead) without holding "view all".
    if (this.isOffice(actor, task, 'canAssignTasks')) return task;
    if (!(await this.taskAccess.allows(task, actor))) throw new NotFoundException('Task not found');
    return task;
  }

  /** Everybody on the job: the named leader and every assignee row. */
  async crewOf(
    task: Pick<CrewTask, 'id' | 'assignedToId'>,
  ): Promise<Array<{ userId: string; role: 'LEAD' | 'MEMBER' }>> {
    const rows = await this.prisma.taskAssignee.findMany({
      where: { taskId: task.id },
      // Put on first, first — the order a stand-in is picked in must not be the database's whim.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { userId: true, role: true },
    });
    const out = new Map<string, 'LEAD' | 'MEMBER'>(rows.map((r) => [r.userId, r.role as 'LEAD' | 'MEMBER']));
    if (task.assignedToId && !out.has(task.assignedToId)) out.set(task.assignedToId, 'LEAD');
    return [...out].map(([userId, role]) => ({ userId, role }));
  }

  /** Who of these is on the clock now — one indexed query. */
  async onClock(userIds: string[], organizationId: string): Promise<Map<string, Date>> {
    if (!userIds.length) return new Map();
    const rows = await this.prisma.timeEntry.findMany({
      where: { organizationId, userId: { in: userIds }, status: 'CLOCKED_IN' },
      select: { userId: true, clockInAt: true },
    });
    return new Map(rows.map((r) => [r.userId, r.clockInAt]));
  }

  /** How each step of this job counts. */
  async kindOf(task: Pick<CrewTask, 'organizationId' | 'workflowId' | 'spaceId'>) {
    const flowId =
      task.workflowId ?? (task.spaceId ? await resolveSpaceDefaultWorkflowId(this.prisma, task.spaceId) : null);
    const wf = await this.workflows.getWorkflow(task.organizationId, flowId);
    return { kind: (s: string) => stepTimeKind(s, stepCapabilities(wf, s)) };
  }

  /** Who leads this job right now (shared effectiveLeader), from one read of its history. */
  leaderFrom(
    task: CrewTask,
    crew: Array<{ userId: string; role: string }>,
    timeline: WorkTimelineEvent[],
    onClock: Map<string, Date>,
    now = Date.now(),
  ): EffectiveLeader {
    const presence = crewPresence(
      timeline,
      crew.map((c) => c.userId),
    );
    const joinedInOrder = [...presence]
      .filter(([, p]) => p.joined)
      // Join order; two joined at the same moment, by id — the same stand-in on every read.
      .sort((a, b) => (a[1].since ?? 0) - (b[1].since ?? 0) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([id]) => id);
    const leadId = crew.find((c) => c.role === 'LEAD')?.userId ?? task.assignedToId ?? null;
    return effectiveLeader({
      leadId,
      today:
        task.leadOverrideId && task.leadOverrideUntil
          ? { userId: task.leadOverrideId, until: task.leadOverrideUntil.getTime() }
          : null,
      now,
      onClock: new Set(onClock.keys()),
      joinedInOrder,
      // Before anybody joined, the crew itself (leader row first) — a job with a sick leader can still start.
      crewInOrder: [...crew]
        .sort((a, b) => (a.role === 'LEAD' ? -1 : 0) - (b.role === 'LEAD' ? -1 : 0))
        .map((c) => c.userId),
    });
  }

  /** May the office act on this job's step and lead (role, org-wide grant, or the job's workspace)? */
  isOffice(actor: CrewActor, task: Pick<CrewTask, 'spaceId'>, key: 'canViewAllTasks' | 'canAssignTasks'): boolean {
    return (
      actor.userRole === Role.ADMIN ||
      !!actor[key] ||
      actor.access?.org?.[key] === true ||
      accessAllowsInSpace(actor.access, key, task.spaceId ?? undefined)
    );
  }

  async viewOf(task: CrewTask) {
    const crew = await this.crewOf(task);
    const ids = crew.map((c) => c.userId);
    const [timeline, onClock, people, org] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.onClock(ids, task.organizationId),
      peopleFaces(this.prisma, ids),
      orgCrewMode(this.prisma, task.organizationId),
    ]);
    const presence = crewPresence(timeline, ids);
    const leader = this.leaderFrom(task, crew, timeline, onClock);
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      crewMode: !!org?.crewMode,
      leader: { userId: leader.userId, acting: leader.acting, source: leader.source },
      today:
        task.leadOverrideId && task.leadOverrideUntil && task.leadOverrideUntil.getTime() > Date.now()
          ? { userId: task.leadOverrideId, until: task.leadOverrideUntil.toISOString() }
          : null,
      members: crew.map((c) => {
        const p = presence.get(c.userId);
        return {
          user: byId.get(c.userId) ?? { id: c.userId, firstName: '', lastName: '', avatarUrl: null },
          role: c.role,
          joined: !!p?.joined,
          since: p?.since != null ? new Date(p.since).toISOString() : null,
          // Joined and gone again (not "never came") — the checklist's "has left, still open".
          lastLeftAt: p?.lastLeftAt != null ? new Date(p.lastLeftAt).toISOString() : null,
          selfBlockedSince: p?.selfBlockedSince != null ? new Date(p.selfBlockedSince).toISOString() : null,
          selfBlockReason: p?.selfBlockReason ?? null,
          onClock: onClock.has(c.userId),
        };
      }),
    };
  }

  /** One shared rule for a name (people/person-name.ts) — never "John null". */
  nameOf(userId: string): Promise<string> {
    return personNameById(this.prisma as never, userId);
  }

  /** The zone the work is in — what "today" means for a hand-over. */
  async zoneOf(task: Pick<CrewTask, 'spaceId' | 'organizationId'>): Promise<string> {
    const space = task.spaceId
      ? await this.prisma.companyLocation.findUnique({ where: { id: task.spaceId }, select: { timezone: true } })
      : null;
    if (space?.timezone) return space.timezone;
    const org = await orgTimezone(this.prisma, task.organizationId);
    return zoneOf(org?.timezone);
  }
}
