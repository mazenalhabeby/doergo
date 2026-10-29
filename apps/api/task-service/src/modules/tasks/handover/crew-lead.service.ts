import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TaskEventType } from '@prisma/client';
import {
  CREW_CODES,
  endOfLocalDay,
  success,
  type LeadScope,
  personName,
  personNameOf,
  personStanding,
  PrismaService,
  TASK_JOBS,
  type JobData,
} from '@hbcfield/shared';
import { emitEvent, taskLeadChangedEvent } from '@hbcfield/shared/microservices';
import { announceCrewChanged, cleanReason } from './crew-helpers';
import { CrewReader } from './crew-reader.service';
import { JobTimeService } from './job-time.service';

/** Handing a job's lead over — for today, or for good — to somebody already on its crew. */
@Injectable()
export class CrewLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: CrewReader,
    private readonly jobTime: JobTimeService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  /**
   * Hand THIS job's lead to somebody already on its crew — for today, or for
   * good. The effective leader of this job may; so may the office (assign
   * tasks, org-wide or in the job's workspace). Nobody is ADDED to a crew
   * here: that stays behind the assign path and its grant ceiling.
   */
  async changeLead(data: JobData<typeof TASK_JOBS.crewChangeLead>) {
    const task = await this.reader.visibleTaskOf(data.taskId, data);
    const crew = await this.reader.crewOf(task);
    const ids = crew.map((c) => c.userId);
    const [timeline, onClock] = await Promise.all([
      this.jobTime.timelinesOf([task.id]).then((m) => m.get(task.id) ?? []),
      this.reader.onClock(ids, task.organizationId),
    ]);
    const leader = this.reader.leaderFrom(task, crew, timeline, onClock);
    const office = this.reader.isOffice(data, task, 'canAssignTasks');
    if (!office && leader.userId !== data.userId) {
      // A member who can see the job is told why; a stranger learns nothing.
      if (!ids.includes(data.userId)) throw new NotFoundException('Task not found');
      throw new ForbiddenException({
        message: 'Only the leader of this job, or the office, hands its lead over.',
        code: CREW_CODES.LEAD_NOT_YOURS,
      });
    }
    if (!ids.includes(data.toUserId))
      throw new BadRequestException({
        message: 'Choose somebody on this job.',
        code: CREW_CODES.LEAD_TARGET_NOT_ON_CREW,
      });
    const target = await personStanding(this.prisma, data.toUserId);
    if (!target || target.isExternal || target.organizationId !== task.organizationId || target.isActive === false) {
      throw new BadRequestException({
        message: 'They cannot lead this job.',
        code: CREW_CODES.LEAD_TARGET_NOT_ON_CREW,
      });
    }
    const scope: LeadScope = data.scope === 'PERMANENT' ? 'PERMANENT' : 'TODAY';
    /*
      A member standing in — acting for an absent leader, or handed the lead for
      today — hands over for today only: never takes the job for good. Only the
      PERMANENT lead (source LEAD) or the office moves the LEAD row.
    */
    if (scope === 'PERMANENT' && !office && (leader.acting || leader.source !== 'LEAD')) {
      throw new ForbiddenException({
        message: 'Standing in, you can hand the lead over for today only.',
        code: CREW_CODES.LEAD_NOT_YOURS,
      });
    }
    const reason = cleanReason(data.reason);

    if (scope === 'TODAY') {
      const tz = await this.reader.zoneOf(task);
      await this.prisma.task.update({
        where: { id: task.id },
        data: { leadOverrideId: data.toUserId, leadOverrideUntil: endOfLocalDay(new Date(), tz) },
      });
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
        await tx.task.update({
          where: { id: task.id },
          data: { assignedToId: data.toUserId, leadOverrideId: null, leadOverrideUntil: null },
        });
      });
    }
    await this.prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: data.userId,
        eventType: TaskEventType.LEAD_CHANGED,
        // The new leader's name rides along, so the history reads it without a lookup.
        metadata: {
          from: leader.userId,
          to: data.toUserId,
          toName: await this.reader.nameOf(data.toUserId),
          scope,
          by: leader.userId === data.userId ? 'LEADER' : 'OFFICE',
          ...(reason ? { reason } : {}),
        },
      },
    });
    if (data.toUserId !== data.userId) {
      const by = await personNameOf(this.prisma, data.userId);
      emitEvent(this.notifications, taskLeadChangedEvent, {
        taskId: task.id,
        taskTitle: task.title,
        toUserId: data.toUserId,
        byName: personName(by),
        scope,
      });
    }
    const fresh = await this.reader.taskOf(task.id, task.organizationId);
    announceCrewChanged(this.prisma, this.notifications, fresh, data.userId);
    return success(await this.reader.viewOf(fresh));
  }
}
