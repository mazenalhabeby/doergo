import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  crewPresence,
  mayMoveStep,
  success,
  type ChecklistAuthority,
  personName,
  personNameOf,
  orgCrewMode,
  PrismaService,
  type OccurrenceEvidence,
  TASK_JOBS,
  type JobData,
} from '@hbcfield/shared';
import { emitEvent, taskCrewStartedEvent } from '@hbcfield/shared/microservices';
import { CrewActor, CrewTask, TASK_SELECT } from './crew-helpers';
import { CrewReader } from './crew-reader.service';
import { CrewPresenceService } from './crew-presence.service';
import { CrewLeadService } from './crew-lead.service';
import { JobTimeService } from './job-time.service';

export { type CrewActor } from './crew-helpers';

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
    private readonly reader: CrewReader,
    private readonly presence: CrewPresenceService,
    private readonly lead: CrewLeadService,
    private readonly jobTime: JobTimeService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  /** A join as it is written (CrewPresenceService) — also a crew member's tap on the step the job is in. */
  joinAs(
    task: CrewTask,
    who: string,
    opts: { evidence?: OccurrenceEvidence; viaLeaderStart?: boolean; byUserId?: string; reason?: string },
  ): Promise<boolean> {
    return this.presence.joinAs(task, who, opts);
  }

  /** One job at a time: joining one leaves the others they were on (CrewPresenceService). */
  leaveOtherJobs(userId: string, organizationId: string, exceptTaskId: string, at: Date): Promise<void> {
    return this.presence.leaveOtherJobs(userId, organizationId, exceptTaskId, at);
  }

  /** Hand THIS job's lead to somebody already on its crew (CrewLeadService). */
  changeLead(data: JobData<typeof TASK_JOBS.crewChangeLead>) {
    return this.lead.changeLead(data);
  }

  /**
   * Who may give this job's checklist items to whom (shared tasks/checklist.ts):
   * the crew, the office, and who leads now. The leader is only worked out for
   * a caller who is not the office — the office pays one crew read, nothing more.
   * The caller's access to the task itself is checked BEFORE this, by the task gate.
   */
  async checklistAuthority(taskId: string, actor: CrewActor): Promise<ChecklistAuthority> {
    const task = await this.reader.taskOf(taskId, actor.organizationId);
    const crew = await this.reader.crewOf(task);
    const crewIds = crew.map((c) => c.userId);
    const isOffice = this.reader.isOffice(actor, task, 'canAssignTasks');
    if (isOffice || !crewIds.includes(actor.userId))
      return { actorId: actor.userId, isOffice, leaderId: null, crewIds };
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.reader.onClock(crewIds, task.organizationId),
    ]);
    return {
      actorId: actor.userId,
      isOffice,
      leaderId: this.reader.leaderFrom(task, crew, timeline, onClock).userId,
      crewIds,
    };
  }

  /**
   * The crew panel: who is on the job now, who has stopped and why, and who
   * leads — for the job page, the phone and the board. One history read, one
   * clock read, one people read.
   */
  async view(taskId: string, actor: CrewActor) {
    const task = await this.reader.visibleTaskOf(taskId, actor);
    return success(await this.reader.viewOf(task));
  }

  /** The crew panel for a job the caller was already allowed to read (GET /tasks/:id/time). */
  async viewFor(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    return task ? this.reader.viewOf(task) : null;
  }

  // ─────────────────────────── presence (CrewPresenceService) ───────────────────────────

  join(data: JobData<typeof TASK_JOBS.crewJoin>) {
    return this.presence.join(data);
  }

  leave(data: JobData<typeof TASK_JOBS.crewLeave>) {
    return this.presence.leave(data);
  }

  selfIssue(data: JobData<typeof TASK_JOBS.crewSelfIssue>) {
    return this.presence.selfIssue(data);
  }

  selfResume(data: JobData<typeof TASK_JOBS.crewSelfResume>) {
    return this.presence.selfResume(data);
  }

  // ─────────────────────────── hooks for TasksService ───────────────────────────

  /**
   * May this person move the job's step (shared mayMoveStep)? Throws the
   * coded refusal; answers whether they are on the crew. Asked only of a
   * crew member who is not the office — every other move pays nothing.
   */
  async assertMayMoveStep(task: CrewTask, actor: CrewActor, isOffice: boolean): Promise<void> {
    // The office — org-wide, or "view all tasks" in THIS job's workspace — always moves it.
    if (isOffice || this.reader.isOffice(actor, task, 'canViewAllTasks')) return;
    const org = await orgCrewMode(this.prisma, task.organizationId);
    if (!org?.crewMode) return;
    const crew = await this.reader.crewOf(task);
    if (crew.length <= 1) return; // a job with one worker: they lead it
    const ids = crew.map((c) => c.userId);
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.reader.onClock(ids, task.organizationId),
    ]);
    const leader = this.reader.leaderFrom(task, crew, timeline, onClock);
    const verdict = mayMoveStep({
      actorId: actor.userId,
      isOffice: false,
      onCrew: ids.includes(actor.userId),
      crewMode: true,
      leader,
    });
    if (!verdict.ok) {
      const name = leader.userId ? await this.reader.nameOf(leader.userId) : '';
      throw new BadRequestException({
        message: `${name || 'The leader'} moves this job's steps.`,
        code: verdict.code,
        params: { name },
      });
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
      const crew = await this.reader.crewOf(task);
      const others = crew.map((c) => c.userId).filter((id) => id !== starterId);
      if (!others.length) return;
      const [timeline, onClock, starter] = await Promise.all([
        this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
        this.reader.onClock(others, task.organizationId),
        personNameOf(this.prisma, starterId),
      ]);
      const presence = crewPresence(timeline, others);
      const memberIds = others.filter((id) => onClock.has(id) && !presence.get(id)?.joined);
      if (!memberIds.length) return;
      emitEvent(this.notifications, taskCrewStartedEvent, {
        taskId: task.id,
        taskTitle: task.title,
        starterName: personName(starter),
        startedAt: at.toISOString(),
        memberIds,
      });
    } catch (err) {
      this.logger.warn(`Crew start notice failed (task=${taskId}): ${(err as Error).message}`);
    }
  }
}
