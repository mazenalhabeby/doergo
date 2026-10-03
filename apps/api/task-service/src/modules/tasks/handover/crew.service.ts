import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TaskEventType } from '@prisma/client';
import {
  CREW_CODES,
  CREW_REASON_MAX,
  Role,
  accessAllowsInSpace,
  crewPresence,
  effectiveLeader,
  endOfLocalDay,
  joinMoment,
  mayMoveStep,
  stepCapabilities,
  stepTimeKind,
  success,
  type ChecklistAuthority,
  type EffectiveLeader,
  type LeadScope,
  type OccurrenceEvidence,
  type ResolvedAccess,
  type WorkTimelineEvent,
} from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { resolveSpaceDefaultWorkflowId } from '../../../common/space-workflow.util';
import { judgeOccurrence } from '../../../common/occurrence.util';
import { ClockGateService } from './clock-gate.service';
import { JobPauseService } from './job-pause.service';
import { JobTimeService } from './job-time.service';

/** Who is asking, as the gateway resolved it. */
export interface CrewActor {
  userId: string;
  userRole: string;
  organizationId: string;
  /** Org-wide "view all tasks" — the office's authority over a job's step. */
  canViewAllTasks?: boolean;
  /** Org-wide "assign tasks" — the office's authority over who leads. */
  canAssignTasks?: boolean;
  access?: ResolvedAccess | null;
}

type CrewTask = {
  id: string;
  title: string;
  status: string;
  organizationId: string;
  spaceId: string | null;
  workflowId: string | null;
  assignedToId: string | null;
  pausedAt: Date | null;
  leadOverrideId: string | null;
  leadOverrideUntil: Date | null;
};

const TASK_SELECT = {
  id: true, title: true, status: true, organizationId: true, spaceId: true, workflowId: true,
  assignedToId: true, pausedAt: true, leadOverrideId: true, leadOverrideUntil: true,
} as const;
const PERSON = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;
/** What the phone said about a crew tap, kept on the event like a status move keeps it. */
const evidenceMeta = (evidence: OccurrenceEvidence | undefined, flags: readonly string[]) => ({
  ...(flags.length ? { occurrenceFlags: [...flags] } : {}),
  ...(evidence?.fix ? { fix: { lat: evidence.fix.lat, lng: evidence.fix.lng, accuracy: evidence.fix.accuracy } } : {}),
});
const cleanReason = (r?: string | null) => (typeof r === 'string' ? r.replace(/\s+/g, ' ').trim().slice(0, CREW_REASON_MAX) : '');

/**
 * A crew on one job (packages/shared/src/tasks/crew.ts): each person's own
 * presence, their own stop, and who leads. Its own service so TasksService
 * asks it rather than growing; the rules themselves live in shared, read the
 * same way by the job page, the phone and the report.
 *
 * ⚠️ THE SERVER IS THE BOUNDARY. On the crew, joined, the effective leader,
 * the new leader on THIS crew — each is checked here, never only on a screen.
 * A job the caller cannot see is a 404 (no existence leak); a rule they can
 * act on is a 400 with a code.
 */
@Injectable()
export class CrewService {
  private readonly logger = new Logger(CrewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowConfigCache,
    private readonly clockGate: ClockGateService,
    private readonly jobPause: JobPauseService,
    private readonly jobTime: JobTimeService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  // ─────────────────────────── reads ───────────────────────────

  /** A job of the caller's organization, or 404. Crew actions never reach across organizations. */
  private async taskOf(taskId: string, organizationId: string): Promise<CrewTask> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    if (!task || task.organizationId !== organizationId) throw new NotFoundException('Task not found');
    return task;
  }

  /** Everybody on the job: the named leader and every assignee row. */
  private async crewOf(task: Pick<CrewTask, 'id' | 'assignedToId'>): Promise<Array<{ userId: string; role: 'LEAD' | 'MEMBER' }>> {
    const rows = await this.prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true, role: true } });
    const out = new Map<string, 'LEAD' | 'MEMBER'>(rows.map((r) => [r.userId, r.role as 'LEAD' | 'MEMBER']));
    if (task.assignedToId && !out.has(task.assignedToId)) out.set(task.assignedToId, 'LEAD');
    return [...out].map(([userId, role]) => ({ userId, role }));
  }

  /** Who of these is on the clock now — one indexed query. */
  private async onClock(userIds: string[], organizationId: string): Promise<Map<string, Date>> {
    if (!userIds.length) return new Map();
    const rows = await this.prisma.timeEntry.findMany({
      where: { organizationId, userId: { in: userIds }, status: 'CLOCKED_IN' },
      select: { userId: true, clockInAt: true },
    });
    return new Map(rows.map((r) => [r.userId, r.clockInAt]));
  }

  /** How each step of this job counts. */
  private async kindOf(task: Pick<CrewTask, 'organizationId' | 'workflowId' | 'spaceId'>) {
    const flowId = task.workflowId ?? (task.spaceId ? await resolveSpaceDefaultWorkflowId(this.prisma, task.spaceId) : null);
    const wf = await this.workflows.getWorkflow(task.organizationId, flowId);
    return { kind: (s: string) => stepTimeKind(s, stepCapabilities(wf, s)) };
  }

  /** Who leads this job right now (shared effectiveLeader), from one read of its history. */
  private leaderFrom(task: CrewTask, crew: Array<{ userId: string; role: string }>, timeline: WorkTimelineEvent[], onClock: Map<string, Date>, now = Date.now()): EffectiveLeader {
    const presence = crewPresence(timeline, crew.map((c) => c.userId));
    const joinedInOrder = [...presence].filter(([, p]) => p.joined).sort((a, b) => (a[1].since ?? 0) - (b[1].since ?? 0)).map(([id]) => id);
    const leadId = crew.find((c) => c.role === 'LEAD')?.userId ?? task.assignedToId ?? null;
    return effectiveLeader({
      leadId,
      today: task.leadOverrideId && task.leadOverrideUntil ? { userId: task.leadOverrideId, until: task.leadOverrideUntil.getTime() } : null,
      now,
      onClock: new Set(onClock.keys()),
      joinedInOrder,
      // Before anybody joined, the crew itself (leader row first) — a job with a sick leader can still start.
      crewInOrder: [...crew].sort((a, b) => (a.role === 'LEAD' ? -1 : 0) - (b.role === 'LEAD' ? -1 : 0)).map((c) => c.userId),
    });
  }

  /** May the office act on this job's step and lead (role, org-wide grant, or the job's workspace)? */
  private isOffice(actor: CrewActor, task: Pick<CrewTask, 'spaceId'>, key: 'canViewAllTasks' | 'canAssignTasks'): boolean {
    return actor.userRole === Role.ADMIN || !!actor[key] || actor.access?.org?.[key] === true || accessAllowsInSpace(actor.access, key, task.spaceId ?? undefined);
  }

  /**
   * Who may give this job's checklist items to whom (shared tasks/checklist.ts):
   * the crew, the office, and who leads now. The leader is only worked out for
   * a caller who is not the office — the office pays one crew read, nothing more.
   * The caller's access to the task itself is checked BEFORE this, by the task gate.
   */
  async checklistAuthority(taskId: string, actor: CrewActor): Promise<ChecklistAuthority> {
    const task = await this.taskOf(taskId, actor.organizationId);
    const crew = await this.crewOf(task);
    const crewIds = crew.map((c) => c.userId);
    const isOffice = this.isOffice(actor, task, 'canAssignTasks');
    if (isOffice || !crewIds.includes(actor.userId)) return { actorId: actor.userId, isOffice, leaderId: null, crewIds };
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.onClock(crewIds, task.organizationId),
    ]);
    return { actorId: actor.userId, isOffice, leaderId: this.leaderFrom(task, crew, timeline, onClock).userId, crewIds };
  }

  /**
   * The crew panel: who is on the job now, who has stopped and why, and who
   * leads — for the job page, the phone and the board. One history read, one
   * clock read, one people read.
   */
  async view(taskId: string, actor: CrewActor) {
    const task = await this.taskOf(taskId, actor.organizationId);
    return success(await this.viewOf(task));
  }

  /** The crew panel for a job the caller was already allowed to read (GET /tasks/:id/time). */
  async viewFor(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    return task ? this.viewOf(task) : null;
  }

  private async viewOf(task: CrewTask) {
    const crew = await this.crewOf(task);
    const ids = crew.map((c) => c.userId);
    const [timeline, onClock, people, org] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.onClock(ids, task.organizationId),
      this.prisma.user.findMany({ where: { id: { in: ids } }, ...PERSON }),
      this.prisma.organization.findUnique({ where: { id: task.organizationId }, select: { crewMode: true } }),
    ]);
    const presence = crewPresence(timeline, ids);
    const leader = this.leaderFrom(task, crew, timeline, onClock);
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      crewMode: !!org?.crewMode,
      leader: { userId: leader.userId, acting: leader.acting, source: leader.source },
      today: task.leadOverrideId && task.leadOverrideUntil && task.leadOverrideUntil.getTime() > Date.now()
        ? { userId: task.leadOverrideId, until: task.leadOverrideUntil.toISOString() }
        : null,
      members: crew.map((c) => {
        const p = presence.get(c.userId);
        return {
          user: byId.get(c.userId) ?? { id: c.userId, firstName: '', lastName: '', avatarUrl: null },
          role: c.role,
          joined: !!p?.joined,
          since: p?.since != null ? new Date(p.since).toISOString() : null,
          selfBlockedSince: p?.selfBlockedSince != null ? new Date(p.selfBlockedSince).toISOString() : null,
          selfBlockReason: p?.selfBlockReason ?? null,
          onClock: onClock.has(c.userId),
        };
      }),
    };
  }

  // ─────────────────────────── presence ───────────────────────────

  /**
   * Join a crew job: "I'm with him" (from the leader's start, within the
   * window), the step the job is already in, or the office for somebody
   * (with a reason). Idempotent while joined. The clock gate applies.
   */
  async join(data: CrewActor & { taskId: string; evidence?: OccurrenceEvidence; viaLeaderStart?: boolean; forUserId?: string; reason?: string }) {
    const task = await this.taskOf(data.taskId, data.organizationId);
    const forOther = !!data.forUserId && data.forUserId !== data.userId;
    // Putting somebody ON a job is a decision about who works it: assign rights, not "view all".
    if (forOther && !this.isOffice(data, task, 'canAssignTasks')) throw new NotFoundException('Task not found');
    const reason = cleanReason(data.reason);
    if (forOther && !reason) throw new BadRequestException({ message: 'Say why you are adding them to the job.', code: 'OFFICE_START_REASON_REQUIRED' });
    const who = forOther ? data.forUserId! : data.userId;
    await this.joinAs(task, who, { evidence: data.evidence, viaLeaderStart: !!data.viaLeaderStart, byUserId: forOther ? data.userId : undefined, reason: forOther ? reason : undefined });
    return success(await this.viewOf(task));
  }

  /**
   * The join itself — also how a crew member's tap on the step the job is
   * already in counts. Writes only; answers whether a join was written.
   */
  async joinAs(
    task: CrewTask,
    who: string,
    opts: { evidence?: OccurrenceEvidence; viaLeaderStart?: boolean; byUserId?: string; reason?: string },
  ): Promise<boolean> {
    const crew = await this.crewOf(task);
    if (!crew.some((c) => c.userId === who)) throw new BadRequestException({ message: 'They are not on this job.', code: CREW_CODES.NOT_ON_CREW });
    const person = await this.prisma.user.findUnique({ where: { id: who }, select: { isExternal: true, organizationId: true } });
    // External members hold no clock and work no job of ours (EXTERNAL_FORBIDDEN_MODULES).
    if (!person || person.isExternal || person.organizationId !== task.organizationId) {
      throw new BadRequestException({ message: 'They cannot join this job.', code: CREW_CODES.NOT_ON_CREW });
    }
    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(timeline, [who]).get(who);
    if (presence?.joined) return false;

    const { kind } = await this.kindOf(task);
    // Not under way: a paused job is picked up with Resume; one not started with its first step.
    if (task.pausedAt || !kind(task.status)) throw new BadRequestException({ message: 'The job is not under way.', code: CREW_CODES.JOB_NOT_STARTED });

    // On the clock, as for any way onto a job; the tap's own time, never before the clock-in.
    const clock = await this.clockGate.assertWorkerClockedIn(task, who, task.organizationId, true);
    const judged = judgeOccurrence(opts.evidence, clock?.clockInAt ?? null);
    const tapAt = judged.at.getTime();
    const runStart = this.runStart(timeline, kind);
    /*
      ⚠️ NEVER BACK-DATED PAST WHAT HAPPENED. A tap's time comes from the phone;
      it is held to the job's own stretch of work (a join before the job was
      under way joins when it started) and to their own last leave (a join
      cannot reopen time they were off the job). "I'm with him" counts from
      the leader's start only through joinMoment's window.
    */
    const floor = Math.max(runStart ?? -Infinity, presence?.lastLeftAt ?? -Infinity);
    const at = Math.max(
      joinMoment({ tapAt, leaderStartAt: opts.viaLeaderStart ? runStart : null, clockInAt: clock?.clockInAt ? clock.clockInAt.getTime() : null }),
      floor,
    );

    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: who,
        eventType: TaskEventType.CREW_JOINED,
        metadata: {
          at: new Date(at).toISOString(),
          ...(opts.viaLeaderStart && at < tapAt ? { viaLeaderAt: new Date(at).toISOString() } : {}),
          ...(opts.byUserId ? { byUserId: opts.byUserId, reason: opts.reason } : {}),
          // As status moves keep them: what the phone said, and what looked odd about it.
          ...evidenceMeta(opts.evidence, judged.flags),
        },
      },
    });
    // Their other job ends at the tap itself, never at a moment counted back from it.
    await this.leaveOtherJobs(who, task.organizationId, task.id, new Date(tapAt));
    this.changed(task, who);
    return true;
  }

  /** When the job's current stretch of counted time began — what "I'm with him" counts from. */
  private runStart(timeline: WorkTimelineEvent[], kind: (s: string) => unknown): number | null {
    let counting = false;
    let start: number | null = null;
    let status: string | undefined;
    let paused = false;
    for (const e of [...timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())) {
      if (e.kind === 'STATUS') { status = e.status; paused = false; }
      else if (e.kind === 'PAUSED') paused = true;
      else if (e.kind === 'RESUMED') paused = false;
      else continue;
      const now = !paused && !!kind(status ?? '');
      if (now && !counting) start = new Date(e.at).getTime();
      counting = now;
    }
    return counting ? start : null;
  }

  /**
   * One job at a time: joining (or moving into work on) one job leaves the
   * others they were on — recorded, so the crew panel of the other job is
   * the truth, not only the arithmetic.
   */
  async leaveOtherJobs(userId: string, organizationId: string, exceptTaskId: string, at: Date): Promise<void> {
    const others = (await this.jobPause.workingJobsOf(userId, organizationId)).filter((j) => j.id !== exceptTaskId);
    if (!others.length) return;
    const timelines = await this.jobTime.timelinesOf(others.map((j) => j.id));
    const left = others.filter((j) => crewPresence(timelines.get(j.id) ?? [], [userId]).get(userId)?.joined);
    if (!left.length) return;
    await this.prisma.taskEvent.createMany({
      data: left.map((j) => ({ taskId: j.id, userId, eventType: TaskEventType.CREW_LEFT, metadata: { at: at.toISOString(), why: 'OTHER_JOB' } })),
    });
  }

  /**
   * Leave a crew job (their own, or the office for them). The last joined
   * member on the clock leaving pauses it, and owes the note — the same pause
   * a clock-out makes.
   */
  async leave(data: CrewActor & { taskId: string; evidence?: OccurrenceEvidence; forUserId?: string; reason?: string }) {
    const task = await this.taskOf(data.taskId, data.organizationId);
    const forOther = !!data.forUserId && data.forUserId !== data.userId;
    if (forOther && !this.isOffice(data, task, 'canAssignTasks')) throw new NotFoundException('Task not found');
    const who = forOther ? data.forUserId! : data.userId;
    const crew = await this.crewOf(task);
    if (!crew.some((c) => c.userId === who)) throw new BadRequestException({ message: 'They are not on this job.', code: CREW_CODES.NOT_ON_CREW });

    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(timeline, crew.map((c) => c.userId));
    const mine = presence.get(who);
    if (!mine?.joined) return success(await this.viewOf(task));

    const judged = judgeOccurrence(data.evidence, mine.since != null ? new Date(mine.since) : null);
    const at = judged.at;
    /*
      ⚠️ ONE LEAVE AT A TIME PER JOB. The last two leaving at the same moment
      would each see the other still on and neither would pause it — a job
      running with nobody counted. The job's row is locked for the write, and
      who is still on is read only AFTER it — the second to commit sees both.
    */
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "tasks" WHERE id = ${task.id} FOR UPDATE`;
      await tx.taskEvent.create({
        data: {
          taskId: task.id, userId: who, eventType: TaskEventType.CREW_LEFT,
          metadata: { at: at.toISOString(), why: forOther ? 'OFFICE' : 'SELF', ...(forOther ? { byUserId: data.userId, reason: cleanReason(data.reason) } : {}), ...evidenceMeta(data.evidence, judged.flags) },
        },
      });
    });
    const after = crewPresence((await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [], crew.map((c) => c.userId));
    const othersJoined = [...after].filter(([id, p]) => id !== who && p.joined).map(([id]) => id);
    const stillOn = await this.onClock(othersJoined, task.organizationId);
    if (stillOn.size === 0) await this.jobPause.pauseOnLeave(task.id, who, task.organizationId, at);
    this.changed(task, who);
    return success(await this.viewOf(task));
  }

  /** "My issue": only this person's time is blocked — the job and the crew carry on. */
  async selfIssue(data: CrewActor & { taskId: string; reason?: string; evidence?: OccurrenceEvidence }) {
    const task = await this.taskOf(data.taskId, data.organizationId);
    const reason = cleanReason(data.reason);
    if (!reason) throw new BadRequestException({ message: 'Say what stopped you.', code: 'REASON_REQUIRED' });
    const { presence } = await this.mustBeJoined(task, data.userId);
    if (presence.selfBlockedSince != null) return success(await this.viewOf(task));
    const judged = judgeOccurrence(data.evidence, presence.since != null ? new Date(presence.since) : null);
    await this.prisma.taskEvent.create({
      data: { taskId: task.id, userId: data.userId, eventType: TaskEventType.SELF_BLOCKED, metadata: { at: judged.at.toISOString(), reason, ...evidenceMeta(data.evidence, judged.flags) } },
    });
    // The leader is told why one of the crew has stopped.
    const view = await this.viewOf(task);
    if (view.leader.userId && view.leader.userId !== data.userId) {
      const me = view.members.find((m) => m.user.id === data.userId)?.user;
      this.notifications.emit('task_crew_issue', { taskId: task.id, taskTitle: task.title, leaderId: view.leader.userId, name: me ? `${me.firstName} ${me.lastName}`.trim() : '', reason });
    }
    this.changed(task, data.userId);
    return success(view);
  }

  /** Back to work after their own stop — a move into work, so the clock gate applies. */
  async selfResume(data: CrewActor & { taskId: string; evidence?: OccurrenceEvidence }) {
    const task = await this.taskOf(data.taskId, data.organizationId);
    const { presence } = await this.mustBeJoined(task, data.userId);
    if (presence.selfBlockedSince == null) return success(await this.viewOf(task));
    await this.clockGate.assertWorkerClockedIn(task, data.userId, task.organizationId, true);
    const judged = judgeOccurrence(data.evidence, new Date(presence.selfBlockedSince));
    await this.prisma.taskEvent.create({
      data: { taskId: task.id, userId: data.userId, eventType: TaskEventType.SELF_RESUMED, metadata: { at: judged.at.toISOString(), ...evidenceMeta(data.evidence, judged.flags) } },
    });
    this.changed(task, data.userId);
    return success(await this.viewOf(task));
  }

  private async mustBeJoined(task: CrewTask, userId: string) {
    const crew = await this.crewOf(task);
    if (!crew.some((c) => c.userId === userId)) throw new BadRequestException({ message: 'You are not on this job.', code: CREW_CODES.NOT_ON_CREW });
    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(timeline, [userId]).get(userId)!;
    if (!presence.joined) throw new BadRequestException({ message: 'Join the job first.', code: CREW_CODES.NOT_JOINED });
    return { presence };
  }

  // ─────────────────────────── the lead ───────────────────────────

  /**
   * Hand THIS job's lead to somebody already on its crew — for today, or for
   * good. The effective leader of this job may; so may the office (assign
   * tasks, org-wide or in the job's workspace). Nobody is ADDED to a crew
   * here: that stays behind the assign path and its grant ceiling.
   */
  async changeLead(data: CrewActor & { taskId: string; toUserId: string; scope: LeadScope; reason?: string }) {
    const task = await this.taskOf(data.taskId, data.organizationId);
    const crew = await this.crewOf(task);
    const ids = crew.map((c) => c.userId);
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.onClock(ids, task.organizationId),
    ]);
    const leader = this.leaderFrom(task, crew, timeline, onClock);
    const office = this.isOffice(data, task, 'canAssignTasks');
    if (!office && leader.userId !== data.userId) {
      // A member who can see the job is told why; a stranger learns nothing.
      if (!ids.includes(data.userId)) throw new NotFoundException('Task not found');
      throw new ForbiddenException({ message: 'Only the leader of this job, or the office, hands its lead over.', code: CREW_CODES.LEAD_NOT_YOURS });
    }
    if (!ids.includes(data.toUserId)) throw new BadRequestException({ message: 'Choose somebody on this job.', code: CREW_CODES.LEAD_TARGET_NOT_ON_CREW });
    const target = await this.prisma.user.findUnique({ where: { id: data.toUserId }, select: { isExternal: true, organizationId: true, isActive: true } });
    if (!target || target.isExternal || target.organizationId !== task.organizationId || target.isActive === false) {
      throw new BadRequestException({ message: 'They cannot lead this job.', code: CREW_CODES.LEAD_TARGET_NOT_ON_CREW });
    }
    const scope: LeadScope = data.scope === 'PERMANENT' ? 'PERMANENT' : 'TODAY';
    // A member standing in for an absent leader hands over for today — never takes the job from them for good.
    if (scope === 'PERMANENT' && !office && leader.acting) {
      throw new ForbiddenException({ message: 'Standing in, you can hand the lead over for today only.', code: CREW_CODES.LEAD_NOT_YOURS });
    }
    const reason = cleanReason(data.reason);

    if (scope === 'TODAY') {
      const tz = await this.zoneOf(task);
      await this.prisma.task.update({ where: { id: task.id }, data: { leadOverrideId: data.toUserId, leadOverrideUntil: endOfLocalDay(new Date(), tz) } });
    } else {
      // The same shape the assign path writes: the LEAD row, the legacy column, and no stale override.
      /*
        ⚠️ The job's row is locked first: two hand-overs at once each demoted
        only the LEAD rows they saw and promoted their own pick — two leaders.
      */
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "tasks" WHERE id = ${task.id} FOR UPDATE`;
        await tx.taskAssignee.updateMany({ where: { taskId: task.id, role: 'LEAD' }, data: { role: 'MEMBER' } });
        await tx.taskAssignee.upsert({
          where: { taskId_userId: { taskId: task.id, userId: data.toUserId } },
          create: { taskId: task.id, userId: data.toUserId, role: 'LEAD' },
          update: { role: 'LEAD' },
        });
        await tx.task.update({ where: { id: task.id }, data: { assignedToId: data.toUserId, leadOverrideId: null, leadOverrideUntil: null } });
      });
    }
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.LEAD_CHANGED,
        // The new leader's name rides along, so the history reads it without a lookup.
        metadata: { from: leader.userId, to: data.toUserId, toName: await this.nameOf(data.toUserId), scope, by: leader.userId === data.userId ? 'LEADER' : 'OFFICE', ...(reason ? { reason } : {}) },
      },
    });
    if (data.toUserId !== data.userId) {
      const by = await this.prisma.user.findUnique({ where: { id: data.userId }, select: { firstName: true, lastName: true } });
      this.notifications.emit('task_lead_changed', { taskId: task.id, taskTitle: task.title, toUserId: data.toUserId, byName: by ? `${by.firstName} ${by.lastName}`.trim() : '', scope });
    }
    const fresh = await this.taskOf(task.id, task.organizationId);
    this.changed(fresh, data.userId);
    return success(await this.viewOf(fresh));
  }

  private async nameOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName} ${u.lastName}`.trim() : '';
  }

  /** The zone the work is in — what "today" means for a hand-over. */
  private async zoneOf(task: Pick<CrewTask, 'spaceId' | 'organizationId'>): Promise<string> {
    const space = task.spaceId ? await this.prisma.companyLocation.findUnique({ where: { id: task.spaceId }, select: { timezone: true } }) : null;
    if (space?.timezone) return space.timezone;
    const org = await this.prisma.organization.findUnique({ where: { id: task.organizationId }, select: { timezone: true } });
    return org?.timezone || 'UTC';
  }

  // ─────────────────────────── hooks for TasksService ───────────────────────────

  /**
   * May this person move the job's step (shared mayMoveStep)? Throws the
   * coded refusal; answers whether they are on the crew. Asked only of a
   * crew member who is not the office — every other move pays nothing.
   */
  async assertMayMoveStep(task: CrewTask, actor: CrewActor, isOffice: boolean): Promise<void> {
    // The office — org-wide, or "view all tasks" in THIS job's workspace — always moves it.
    if (isOffice || this.isOffice(actor, task, 'canViewAllTasks')) return;
    const org = await this.prisma.organization.findUnique({ where: { id: task.organizationId }, select: { crewMode: true } });
    if (!org?.crewMode) return;
    const crew = await this.crewOf(task);
    if (crew.length <= 1) return; // a job with one worker: they lead it
    const ids = crew.map((c) => c.userId);
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.onClock(ids, task.organizationId),
    ]);
    const leader = this.leaderFrom(task, crew, timeline, onClock);
    const verdict = mayMoveStep({ actorId: actor.userId, isOffice: false, onCrew: ids.includes(actor.userId), crewMode: true, leader });
    if (!verdict.ok) {
      const name = leader.userId ? await this.nameOf(leader.userId) : '';
      throw new BadRequestException({ message: `${name || 'The leader'} moves this job's steps.`, code: verdict.code, params: { name } });
    }
  }

  /**
   * The job just went into counted time (started, or picked up again): ask
   * the crew members on the clock who have not joined whether they are with
   * the one who started it. Never throws — the move already happened.
   */
  async announceStart(taskId: string, starterId: string, at: Date): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
      if (!task) return;
      const crew = await this.crewOf(task);
      const others = crew.map((c) => c.userId).filter((id) => id !== starterId);
      if (!others.length) return;
      const [timeline, onClock, starter] = await Promise.all([
        this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
        this.onClock(others, task.organizationId),
        this.prisma.user.findUnique({ where: { id: starterId }, select: { firstName: true, lastName: true } }),
      ]);
      const presence = crewPresence(timeline, others);
      const memberIds = others.filter((id) => onClock.has(id) && !presence.get(id)?.joined);
      if (!memberIds.length) return;
      this.notifications.emit('task_crew_started', {
        taskId: task.id, taskTitle: task.title, starterName: starter ? `${starter.firstName} ${starter.lastName}`.trim() : '',
        startedAt: at.toISOString(), memberIds,
      });
    } catch (err) {
      this.logger.warn(`Crew start notice failed (task=${taskId}): ${(err as Error).message}`);
    }
  }

  /** Every open screen on this job redraws: the board, the job page, the phones. */
  private changed(task: Pick<CrewTask, 'id' | 'organizationId'>, actorId: string) {
    void this.prisma.task.findUnique({ where: { id: task.id } }).then((t) => {
      if (t) this.notifications.emit('task_updated', { task: t, actorId });
    }).catch(() => undefined);
  }
}
