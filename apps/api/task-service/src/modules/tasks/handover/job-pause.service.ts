import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TaskEventType } from '@prisma/client';
import { cleanHandoverNote, pausesAtClockOut, PrismaService, TASK_JOBS, type JobData } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { ClockOutHandover, Candidate } from './job-pause-helpers';
import { HandoverNoteService } from './handover-note.service';
import { JobTimeService } from './job-time.service';
import { crewOnJobs, workingJobsOf } from './working-jobs';
import { emitEvent, tasksPausedEvent } from '@hbcfield/shared/microservices';

export { type ClockOutHandover } from './job-pause-helpers';

/**
 * Paused at clock-out, and the handover note. Rule: packages/shared/src/tasks/handover.ts
 *
 * Its own service because the attendance side calls it from every way a shift
 * ends — the clock-out, "I forgot to clock out", the open-shift sweep and a
 * manager closing an open shift — and must not depend on the whole task service
 * to do it.
 *
 * ⚠️ `pauseAtClockOut` NEVER throws. The clock-out has already happened when it
 * runs; a job that could not be paused is logged, never a clock-out refused.
 */
@Injectable()
export class JobPauseService {
  private readonly logger = new Logger(JobPauseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowConfigCache,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
    // The one job-time rule — the pause records what it says the worker put in.
    private readonly jobTime: JobTimeService,
    private readonly notes: HandoverNoteService,
  ) {}

  /** The jobs this person is working right now (working-jobs.ts) — what the clock-out pauses. */
  workingJobsOf(userId: string, organizationId: string, opts: { includePaused?: boolean } = {}): Promise<Candidate[]> {
    return workingJobsOf({ prisma: this.prisma, workflows: this.workflows }, userId, organizationId, opts);
  }

  /**
   * A shift ended at `at`: pause what this person was working on, and keep the
   * notes they wrote. A job somebody else on its crew is still clocked in for
   * keeps running — the crew is still on it.
   *
   * `since` (the shift's start) lets a replaced clock-out time move a pause it
   * already made: the open-shift sweep closes with a guess, and the member's
   * real clock-out arriving later is the truth.
   */
  async pauseAtClockOut(args: {
    userId: string;
    organizationId: string;
    at: Date;
    since?: Date | null;
    reason: 'CLOCK_OUT' | 'AUTO_CLOSE' | 'FORGOT' | 'OFFICE_CLOSE';
    handovers?: ClockOutHandover[];
  }): Promise<{ paused: string[] }> {
    try {
      return await this.pause(args);
    } catch (err) {
      this.logger.error(`Pausing jobs at clock-out failed for user=${args.userId}: ${(err as Error).message}`);
      return { paused: [] };
    }
  }

  private async pause(args: Parameters<JobPauseService['pauseAtClockOut']>[0]): Promise<{ paused: string[] }> {
    const { userId, organizationId, at } = args;

    // A pause this shift already made, at a time now known to be wrong.
    if (args.since) {
      await this.prisma.task.updateMany({
        where: { organizationId, pausedById: userId, pausedAt: { gte: args.since } },
        data: { pausedAt: at },
      });
      // The leave this shift's end already wrote moves with it.
      const lefts = await this.prisma.taskEvent.findMany({
        where: {
          userId,
          eventType: TaskEventType.CREW_LEFT,
          createdAt: { gte: args.since },
          task: { organizationId },
          metadata: { path: ['why'], equals: 'CLOCK_OUT' },
        },
        select: { id: true, metadata: true },
        take: 50,
      });
      for (const l of lefts) {
        await this.prisma.taskEvent.update({
          where: { id: l.id },
          data: { metadata: { ...((l.metadata ?? {}) as object), at: at.toISOString() } },
        });
      }
    }

    const jobs = await this.workingJobsOf(userId, organizationId);
    /*
      ⚠️ THE LAST JOINED MEMBER OUT PAUSES IT (shared crew.ts pausesAtClockOut) —
      not the last person on the crew. A crew member who never joined kept a
      job "running" with nobody counted on it; somebody joined and still on
      the clock keeps it running, and is not stopped under.
    */
    const { joinedOf, onClock } = await crewOnJobs(this.prisma, this.jobTime, jobs, userId, organizationId);
    const toPause = jobs.filter((j) =>
      pausesAtClockOut({ leaverId: userId, joined: joinedOf.get(j.id) ?? [], onClock }),
    );

    // Clocking out is leaving every job they were on — tomorrow they join again.
    const leftOn = jobs.filter((j) => (joinedOf.get(j.id) ?? []).includes(userId));
    if (leftOn.length) {
      await this.prisma.taskEvent.createMany({
        data: leftOn.map((j) => ({
          taskId: j.id,
          userId,
          eventType: TaskEventType.CREW_LEFT,
          metadata: { at: at.toISOString(), why: 'CLOCK_OUT' },
        })),
      });
    }

    const notes = new Map<string, ClockOutHandover>();
    for (const h of args.handovers ?? []) if (h?.taskId && cleanHandoverNote(h.note)) notes.set(h.taskId, h);

    // Each job's time up to the pause, for the record — one calculation for all of them.
    const worked = await this.jobTime.workedForMany(toPause, userId, at);
    const paused: string[] = [];
    for (const job of toPause) {
      const claimed = await this.prisma.task.updateMany({
        where: { id: job.id, pausedAt: null, status: job.status },
        data: { pausedAt: at, pausedById: userId, handoverDueById: notes.has(job.id) ? null : userId },
      });
      if (claimed.count === 0) continue;
      paused.push(job.id);
      const workedMinutes = worked.get(job.id) ?? 0;
      await this.prisma.taskEvent.create({
        data: {
          taskId: job.id,
          userId,
          eventType: TaskEventType.PAUSED,
          metadata: { reason: args.reason, at: at.toISOString(), workedMinutes },
        },
      });
    }

    // The notes — for paused jobs, and for any job they are on that kept running.
    for (const h of notes.values()) {
      await this.notes
        .addHandover({
          id: h.id,
          taskId: h.taskId,
          note: h.note,
          attachmentIds: h.attachmentIds,
          userId,
          organizationId,
        })
        .catch((err) =>
          this.logger.warn(`Handover at clock-out not saved (task=${h.taskId}): ${(err as Error).message}`),
        );
    }

    if (paused.length) {
      emitEvent(this.notifications, tasksPausedEvent, { taskIds: paused, userId, organizationId, reason: args.reason });
    }
    return { paused };
  }

  /**
   * The last joined member left a crew job by their own "Leave job" (not a
   * clock-out): it pauses there, and they owe the note — the same pause a
   * clock-out makes, for one job. False when it was not in work.
   */
  async pauseOnLeave(taskId: string, userId: string, organizationId: string, at: Date): Promise<boolean> {
    const job = (await this.workingJobsOf(userId, organizationId)).find((j) => j.id === taskId);
    if (!job) return false;
    const workedMinutes = (await this.jobTime.workedForMany([job], userId, at)).get(job.id) ?? 0;
    const claimed = await this.prisma.task.updateMany({
      where: { id: job.id, pausedAt: null, status: job.status },
      data: { pausedAt: at, pausedById: userId, handoverDueById: userId },
    });
    if (claimed.count === 0) return false;
    await this.prisma.taskEvent.create({
      data: {
        taskId: job.id,
        userId,
        eventType: TaskEventType.PAUSED,
        metadata: { reason: 'LEFT', at: at.toISOString(), workedMinutes },
      },
    });
    emitEvent(this.notifications, tasksPausedEvent, { taskIds: [job.id], userId, organizationId, reason: 'LEFT' });
    return true;
  }

  /** "What I did, and what is left" (HandoverNoteService). */
  addHandover(data: JobData<typeof TASK_JOBS.addHandover>) {
    return this.notes.addHandover(data);
  }
}
