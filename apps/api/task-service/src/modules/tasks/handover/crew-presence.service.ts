import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TaskEventType } from '@prisma/client';
import {
  CREW_CODES,
  crewPresence,
  joinMoment,
  type OccurrenceEvidence,
  personStanding,
  personName,
  success,
  PrismaService,
  TASK_JOBS,
  type JobData,
} from '@hbcfield/shared';
import { emitEvent, taskCrewIssueEvent } from '@hbcfield/shared/microservices';
import { judgeOccurrence } from '../../../common/occurrence.util';
import { CrewTask, announceCrewChanged, cleanReason, evidenceMeta, runStartOf } from './crew-helpers';
import { CrewReader } from './crew-reader.service';
import { ClockGateService } from './clock-gate.service';
import { JobPauseService } from './job-pause.service';
import { JobTimeService } from './job-time.service';

/**
 * Being on a crew job, person by person: joining it (a tap, "I'm with him", the
 * step it is already in, or the office), leaving it (the last one out pauses
 * it), one's own stop ("My issue") and back, and leaving the other jobs one was on.
 */
@Injectable()
export class CrewPresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: CrewReader,
    private readonly jobTime: JobTimeService,
    private readonly jobPause: JobPauseService,
    private readonly clockGate: ClockGateService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  /**
   * The join itself — also how a crew member's tap on the step the job is
   * already in counts. Writes only; answers whether a join was written.
   */
  async joinAs(
    task: CrewTask,
    who: string,
    opts: { evidence?: OccurrenceEvidence; viaLeaderStart?: boolean; byUserId?: string; reason?: string },
  ): Promise<boolean> {
    const crew = await this.reader.crewOf(task);
    if (!crew.some((c) => c.userId === who))
      throw new BadRequestException({ message: 'They are not on this job.', code: CREW_CODES.NOT_ON_CREW });
    const person = await personStanding(this.prisma, who);
    // External members hold no clock and work no job of ours (EXTERNAL_FORBIDDEN_MODULES).
    if (!person || person.isExternal || person.organizationId !== task.organizationId) {
      throw new BadRequestException({ message: 'They cannot join this job.', code: CREW_CODES.NOT_ON_CREW });
    }
    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(timeline, [who]).get(who);
    if (presence?.joined) return false;

    const { kind } = await this.reader.kindOf(task);
    // Not under way: a paused job is picked up with Resume; one not started with its first step.
    if (task.pausedAt || !kind(task.status))
      throw new BadRequestException({ message: 'The job is not under way.', code: CREW_CODES.JOB_NOT_STARTED });

    // On the clock, as for any way onto a job; the tap's own time, never before the clock-in.
    const clock = await this.clockGate.assertWorkerClockedIn(task, who, task.organizationId, true);
    const judged = judgeOccurrence(opts.evidence, clock?.clockInAt ?? null);
    const tapAt = judged.at.getTime();
    const runStart = runStartOf(timeline, kind);
    /*
      ⚠️ NEVER BACK-DATED PAST WHAT HAPPENED. A tap's time comes from the phone;
      it is held to the job's own stretch of work (a join before the job was
      under way joins when it started) and to their own last leave (a join
      cannot reopen time they were off the job). "I'm with him" counts from
      the leader's start only through joinMoment's window.
    */
    const floor = Math.max(runStart ?? -Infinity, presence?.lastLeftAt ?? -Infinity);
    const at = Math.max(
      joinMoment({
        tapAt,
        leaderStartAt: opts.viaLeaderStart ? runStart : null,
        clockInAt: clock?.clockInAt ? clock.clockInAt.getTime() : null,
      }),
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
    announceCrewChanged(this.prisma, this.notifications, task, who);
    return true;
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
      data: left.map((j) => ({
        taskId: j.id,
        userId,
        eventType: TaskEventType.CREW_LEFT,
        metadata: { at: at.toISOString(), why: 'OTHER_JOB' },
      })),
    });
  }

  async mustBeJoined(task: CrewTask, userId: string) {
    const crew = await this.reader.crewOf(task);
    if (!crew.some((c) => c.userId === userId))
      throw new BadRequestException({ message: 'You are not on this job.', code: CREW_CODES.NOT_ON_CREW });
    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(timeline, [userId]).get(userId)!;
    if (!presence.joined)
      throw new BadRequestException({ message: 'Join the job first.', code: CREW_CODES.NOT_JOINED });
    return { presence };
  }

  /**
   * Join a crew job: "I'm with him" (from the leader's start, within the
   * window), the step the job is already in, or the office for somebody
   * (with a reason). Idempotent while joined. The clock gate applies.
   */
  async join(data: JobData<typeof TASK_JOBS.crewJoin>) {
    const task = await this.reader.visibleTaskOf(data.taskId, data);
    const forOther = !!data.forUserId && data.forUserId !== data.userId;
    // Putting somebody ON a job is a decision about who works it: assign rights, not "view all".
    if (forOther && !this.reader.isOffice(data, task, 'canAssignTasks')) throw new NotFoundException('Task not found');
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
    return success(await this.reader.viewOf(task));
  }

  /**
   * Leave a crew job (their own, or the office for them). The last joined
   * member on the clock leaving pauses it, and owes the note — the same pause
   * a clock-out makes.
   */
  async leave(data: JobData<typeof TASK_JOBS.crewLeave>) {
    const task = await this.reader.visibleTaskOf(data.taskId, data);
    const forOther = !!data.forUserId && data.forUserId !== data.userId;
    if (forOther && !this.reader.isOffice(data, task, 'canAssignTasks')) throw new NotFoundException('Task not found');
    const who = forOther ? data.forUserId! : data.userId;
    const crew = await this.reader.crewOf(task);
    if (!crew.some((c) => c.userId === who))
      throw new BadRequestException({ message: 'They are not on this job.', code: CREW_CODES.NOT_ON_CREW });

    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(
      timeline,
      crew.map((c) => c.userId),
    );
    const mine = presence.get(who);
    if (!mine?.joined) return success(await this.reader.viewOf(task));

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
    const stillOn = await this.reader.onClock(othersJoined, task.organizationId);
    if (stillOn.size === 0) await this.jobPause.pauseOnLeave(task.id, who, task.organizationId, at);
    announceCrewChanged(this.prisma, this.notifications, task, who);
    return success(await this.reader.viewOf(task));
  }

  /** "My issue": only this person's time is blocked — the job and the crew carry on. */
  async selfIssue(data: JobData<typeof TASK_JOBS.crewSelfIssue>) {
    const task = await this.reader.visibleTaskOf(data.taskId, data);
    const reason = cleanReason(data.reason);
    if (!reason) throw new BadRequestException({ message: 'Say what stopped you.', code: 'REASON_REQUIRED' });
    const { presence } = await this.mustBeJoined(task, data.userId);
    if (presence.selfBlockedSince != null) return success(await this.reader.viewOf(task));
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
    const view = await this.reader.viewOf(task);
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
    announceCrewChanged(this.prisma, this.notifications, task, data.userId);
    return success(view);
  }

  /** Back to work after their own stop — a move into work, so the clock gate applies. */
  async selfResume(data: JobData<typeof TASK_JOBS.crewSelfResume>) {
    const task = await this.reader.visibleTaskOf(data.taskId, data);
    const { presence } = await this.mustBeJoined(task, data.userId);
    if (presence.selfBlockedSince == null) return success(await this.reader.viewOf(task));
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
    announceCrewChanged(this.prisma, this.notifications, task, data.userId);
    return success(await this.reader.viewOf(task));
  }
}
