import { ForbiddenException, Injectable } from '@nestjs/common';
import { TaskEventType } from '@prisma/client';
import {
  personName,
  HANDOVER_CODES,
  HANDOVER_PHOTOS_MAX,
  cleanHandoverNote,
  pausesAtClockOut,
  createOnce,
  success,
  assertFoundInOrg,
} from '@hbcfield/shared';
import { ClockOutHandover, AUTHOR } from './job-pause-helpers';
import { JobPauseBase } from './job-pause.base';
import { emitEvent, taskHandoverAddedEvent, tasksPausedEvent } from '@hbcfield/shared/microservices';

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
export class JobPauseService extends JobPauseBase {
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
    const { joinedOf, onClock } = await this.crewOnJobs(jobs, userId, organizationId);
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
      await this.addHandover({
        id: h.id,
        taskId: h.taskId,
        note: h.note,
        attachmentIds: h.attachmentIds,
        userId,
        organizationId,
      }).catch((err) =>
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

  /**
   * "What I did, and what is left." Written by somebody on the job, or by the
   * person who owes it (they may have been taken off it since — the note is
   * exactly what the next person needs). Clears what they owed.
   */
  async addHandover(data: {
    id?: string;
    taskId: string;
    note: string;
    attachmentIds?: string[];
    userId: string;
    organizationId: string;
  }) {
    const note = cleanHandoverNote(data.note);
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
      select: {
        id: true,
        title: true,
        organizationId: true,
        assignedToId: true,
        pausedById: true,
        handoverDueById: true,
      },
    });
    // Another organization's job is not there, as far as this caller knows.
    assertFoundInOrg(task, data.organizationId, 'Task');
    const onTheJob =
      task.assignedToId === data.userId ||
      task.handoverDueById === data.userId ||
      task.pausedById === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: data.userId },
        select: { id: true },
      }));
    if (!onTheJob) {
      throw new ForbiddenException({
        message: 'Only somebody on this job can write its handover',
        code: HANDOVER_CODES.NOT_ON_THE_JOB,
      });
    }
    if (!note)
      throw new ForbiddenException({ message: 'Write what you did and what is left', code: 'HANDOVER_NOTE_REQUIRED' });

    // Photos are the job's own attachments — never another job's, whatever was sent.
    const wanted = [...new Set((data.attachmentIds ?? []).filter((x) => typeof x === 'string'))].slice(
      0,
      HANDOVER_PHOTOS_MAX,
    );
    const attachmentIds = wanted.length
      ? (
          await this.prisma.attachment.findMany({
            where: { id: { in: wanted }, taskId: task.id },
            select: { id: true },
          })
        ).map((a) => a.id)
      : [];

    const lastPause = await this.prisma.taskEvent.findFirst({
      where: { taskId: task.id, userId: data.userId, eventType: TaskEventType.PAUSED },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const workedMinutes = (lastPause?.metadata as { workedMinutes?: number } | null)?.workedMinutes ?? null;

    const include = { author: AUTHOR } as const;
    const { row, created } = await createOnce({
      id: data.id,
      find: (id) => this.prisma.taskHandover.findUnique({ where: { id }, include }),
      isSame: (h) => h.taskId === task.id && h.authorId === data.userId,
      create: () =>
        this.prisma.taskHandover.create({
          data: {
            ...(data.id ? { id: data.id } : {}),
            organizationId: task.organizationId,
            taskId: task.id,
            authorId: data.userId,
            note,
            attachmentIds,
            workedMinutes,
          },
          include,
        }),
    });
    if (!created) return success(row);

    await this.prisma.task.updateMany({
      where: { id: task.id, handoverDueById: data.userId },
      data: { handoverDueById: null },
    });
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.HANDOVER_ADDED,
        metadata: { handoverId: row.id, content: note.length > 100 ? `${note.slice(0, 100)}...` : note },
      },
    });

    // Whoever has the job now hears it — including a note written after they were given it.
    const crew = await this.prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } });
    const recipientIds = [
      ...new Set(
        [task.assignedToId, ...crew.map((c) => c.userId)].filter((id): id is string => !!id && id !== data.userId),
      ),
    ];
    emitEvent(this.notifications, taskHandoverAddedEvent, {
      taskId: task.id,
      taskTitle: task.title,
      authorId: data.userId,
      authorName: personName(row.author),
      recipientIds,
      organizationId: task.organizationId,
    });
    return success(row);
  }
}
