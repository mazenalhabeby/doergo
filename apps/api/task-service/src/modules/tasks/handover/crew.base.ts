import { BadRequestException, Injectable } from '@nestjs/common';
import { TaskEventType } from '@prisma/client';
import {
  CREW_CODES,
  crewPresence,
  joinMoment,
  type OccurrenceEvidence,
  type WorkTimelineEvent,
  personStanding,
} from '@hbcfield/shared';
import { judgeOccurrence } from '../../../common/occurrence.util';
import { CrewTask, evidenceMeta } from './crew-helpers';
import { CrewLookupBase } from './crew-lookup.base';
import { emitEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';

/**
 * The crew's facts, read the same way by every crew action: the job (404 when it
 * cannot be seen), who is on it and on the clock, the effective leader, the crew
 * view, joining, and telling screens it changed.
 */
@Injectable()
export abstract class CrewBase extends CrewLookupBase {
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

    const { kind } = await this.kindOf(task);
    // Not under way: a paused job is picked up with Resume; one not started with its first step.
    if (task.pausedAt || !kind(task.status))
      throw new BadRequestException({ message: 'The job is not under way.', code: CREW_CODES.JOB_NOT_STARTED });

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
    this.changed(task, who);
    return true;
  }

  /** When the job's current stretch of counted time began — what "I'm with him" counts from. */
  protected runStart(timeline: WorkTimelineEvent[], kind: (s: string) => unknown): number | null {
    let counting = false;
    let start: number | null = null;
    let status: string | undefined;
    let paused = false;
    for (const e of [...timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())) {
      if (e.kind === 'STATUS') {
        status = e.status;
        paused = false;
      } else if (e.kind === 'PAUSED') paused = true;
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
      data: left.map((j) => ({
        taskId: j.id,
        userId,
        eventType: TaskEventType.CREW_LEFT,
        metadata: { at: at.toISOString(), why: 'OTHER_JOB' },
      })),
    });
  }

  protected async mustBeJoined(task: CrewTask, userId: string) {
    const crew = await this.crewOf(task);
    if (!crew.some((c) => c.userId === userId))
      throw new BadRequestException({ message: 'You are not on this job.', code: CREW_CODES.NOT_ON_CREW });
    const timeline = (await this.jobTime.timelinesOf([task.id])).get(task.id) ?? [];
    const presence = crewPresence(timeline, [userId]).get(userId)!;
    if (!presence.joined)
      throw new BadRequestException({ message: 'Join the job first.', code: CREW_CODES.NOT_JOINED });
    return { presence };
  }

  /** Every open screen on this job redraws: the board, the job page, the phones. */
  protected changed(task: Pick<CrewTask, 'id' | 'organizationId'>, actorId: string) {
    void this.prisma.task
      .findUnique({ where: { id: task.id } })
      .then((t) => {
        if (t) emitEvent(this.notifications, taskUpdatedEvent, { task: t, actorId });
      })
      .catch(() => undefined);
  }
}
