import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskEventType } from '@prisma/client';
import {
  CREW_CODES,
  crewPresence,
  mayMoveStep,
  success,
  type ChecklistAuthority,
  personName,
  personNameOf,
  orgCrewMode,
} from '@hbcfield/shared';
import { judgeOccurrence } from '../../../common/occurrence.util';
import { CrewActor, CrewTask, TASK_SELECT, evidenceMeta, cleanReason } from './crew-helpers';
import { CrewLeadBase } from './crew-lead.base';
import { emitEvent, taskCrewIssueEvent, taskCrewStartedEvent } from '@hbcfield/shared/microservices';
import { TASK_JOBS, type JobData } from '@hbcfield/shared';

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
export class CrewService extends CrewLeadBase {
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
    if (isOffice || !crewIds.includes(actor.userId))
      return { actorId: actor.userId, isOffice, leaderId: null, crewIds };
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.onClock(crewIds, task.organizationId),
    ]);
    return {
      actorId: actor.userId,
      isOffice,
      leaderId: this.leaderFrom(task, crew, timeline, onClock).userId,
      crewIds,
    };
  }

  /**
   * The crew panel: who is on the job now, who has stopped and why, and who
   * leads — for the job page, the phone and the board. One history read, one
   * clock read, one people read.
   */
  async view(taskId: string, actor: CrewActor) {
    const task = await this.visibleTaskOf(taskId, actor);
    return success(await this.viewOf(task));
  }

  /** The crew panel for a job the caller was already allowed to read (GET /tasks/:id/time). */
  async viewFor(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    return task ? this.viewOf(task) : null;
  }

  // ─────────────────────────── presence ───────────────────────────

  /**
   * Join a crew job: "I'm with him" (from the leader's start, within the
   * window), the step the job is already in, or the office for somebody
   * (with a reason). Idempotent while joined. The clock gate applies.
   */
  async join(data: JobData<typeof TASK_JOBS.crewJoin>) {
    const task = await this.visibleTaskOf(data.taskId, data);
    const forOther = !!data.forUserId && data.forUserId !== data.userId;
    // Putting somebody ON a job is a decision about who works it: assign rights, not "view all".
    if (forOther && !this.isOffice(data, task, 'canAssignTasks')) throw new NotFoundException('Task not found');
    const reason = cleanReason(data.reason);
    if (forOther && !reason)
      throw new BadRequestException({
        message: 'Say why you are adding them to the job.',
        code: 'OFFICE_START_REASON_REQUIRED',
      });
    const who = forOther ? data.forUserId! : data.userId;
    await this.joinAs(task, who, {
      evidence: data.evidence,
      viaLeaderStart: !!data.viaLeaderStart,
      byUserId: forOther ? data.userId : undefined,
      reason: forOther ? reason : undefined,
    });
    return success(await this.viewOf(task));
  }

  /**
   * Leave a crew job (their own, or the office for them). The last joined
   * member on the clock leaving pauses it, and owes the note — the same pause
   * a clock-out makes.
   */
  async leave(data: JobData<typeof TASK_JOBS.crewLeave>) {
    const task = await this.visibleTaskOf(data.taskId, data);
    const forOther = !!data.forUserId && data.forUserId !== data.userId;
    if (forOther && !this.isOffice(data, task, 'canAssignTasks')) throw new NotFoundException('Task not found');
    const who = forOther ? data.forUserId! : data.userId;
    const crew = await this.crewOf(task);
    if (!crew.some((c) => c.userId === who))
      throw new BadRequestException({ message: 'They are not on this job.', code: CREW_CODES.NOT_ON_CREW });

    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(
      timeline,
      crew.map((c) => c.userId),
    );
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
          taskId: task.id,
          userId: who,
          eventType: TaskEventType.CREW_LEFT,
          metadata: {
            at: at.toISOString(),
            why: forOther ? 'OFFICE' : 'SELF',
            ...(forOther ? { byUserId: data.userId, reason: cleanReason(data.reason) } : {}),
            ...evidenceMeta(data.evidence, judged.flags),
          },
        },
      });
    });
    const after = crewPresence(
      (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [],
      crew.map((c) => c.userId),
    );
    const othersJoined = [...after].filter(([id, p]) => id !== who && p.joined).map(([id]) => id);
    const stillOn = await this.onClock(othersJoined, task.organizationId);
    if (stillOn.size === 0) await this.jobPause.pauseOnLeave(task.id, who, task.organizationId, at);
    this.changed(task, who);
    return success(await this.viewOf(task));
  }

  /** "My issue": only this person's time is blocked — the job and the crew carry on. */
  async selfIssue(data: JobData<typeof TASK_JOBS.crewSelfIssue>) {
    const task = await this.visibleTaskOf(data.taskId, data);
    const reason = cleanReason(data.reason);
    if (!reason) throw new BadRequestException({ message: 'Say what stopped you.', code: 'REASON_REQUIRED' });
    const { presence } = await this.mustBeJoined(task, data.userId);
    if (presence.selfBlockedSince != null) return success(await this.viewOf(task));
    const judged = judgeOccurrence(data.evidence, presence.since != null ? new Date(presence.since) : null);
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.SELF_BLOCKED,
        metadata: { at: judged.at.toISOString(), reason, ...evidenceMeta(data.evidence, judged.flags) },
      },
    });
    // The leader is told why one of the crew has stopped.
    const view = await this.viewOf(task);
    if (view.leader.userId && view.leader.userId !== data.userId) {
      const me = view.members.find((m) => m.user.id === data.userId)?.user;
      emitEvent(this.notifications, taskCrewIssueEvent, {
        taskId: task.id,
        taskTitle: task.title,
        leaderId: view.leader.userId,
        name: personName(me),
        reason,
      });
    }
    this.changed(task, data.userId);
    return success(view);
  }

  /** Back to work after their own stop — a move into work, so the clock gate applies. */
  async selfResume(data: JobData<typeof TASK_JOBS.crewSelfResume>) {
    const task = await this.visibleTaskOf(data.taskId, data);
    const { presence } = await this.mustBeJoined(task, data.userId);
    if (presence.selfBlockedSince == null) return success(await this.viewOf(task));
    await this.clockGate.assertWorkerClockedIn(task, data.userId, task.organizationId, true);
    const judged = judgeOccurrence(data.evidence, new Date(presence.selfBlockedSince));
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.SELF_RESUMED,
        metadata: { at: judged.at.toISOString(), ...evidenceMeta(data.evidence, judged.flags) },
      },
    });
    this.changed(task, data.userId);
    return success(await this.viewOf(task));
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
    const org = await orgCrewMode(this.prisma, task.organizationId);
    if (!org?.crewMode) return;
    const crew = await this.crewOf(task);
    if (crew.length <= 1) return; // a job with one worker: they lead it
    const ids = crew.map((c) => c.userId);
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.onClock(ids, task.organizationId),
    ]);
    const leader = this.leaderFrom(task, crew, timeline, onClock);
    const verdict = mayMoveStep({
      actorId: actor.userId,
      isOffice: false,
      onCrew: ids.includes(actor.userId),
      crewMode: true,
      leader,
    });
    if (!verdict.ok) {
      const name = leader.userId ? await this.nameOf(leader.userId) : '';
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
      const crew = await this.crewOf(task);
      const others = crew.map((c) => c.userId).filter((id) => id !== starterId);
      if (!others.length) return;
      const [timeline, onClock, starter] = await Promise.all([
        this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
        this.onClock(others, task.organizationId),
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
