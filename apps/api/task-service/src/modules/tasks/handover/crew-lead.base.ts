/** Handing a job's lead over — moved here unchanged from crew.service.ts. */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TaskEventType } from '@prisma/client';
import { CREW_CODES, endOfLocalDay, success, type LeadScope, personName } from '@hbcfield/shared';
import { CrewActor, cleanReason } from './crew-helpers';
import { CrewBase } from './crew.base';
import { emitEvent, taskLeadChangedEvent } from '@hbcfield/shared/microservices';

export abstract class CrewLeadBase extends CrewBase {
  // ─────────────────────────── the lead ───────────────────────────

  /**
   * Hand THIS job's lead to somebody already on its crew — for today, or for
   * good. The effective leader of this job may; so may the office (assign
   * tasks, org-wide or in the job's workspace). Nobody is ADDED to a crew
   * here: that stays behind the assign path and its grant ceiling.
   */
  async changeLead(data: CrewActor & { taskId: string; toUserId: string; scope: LeadScope; reason?: string }) {
    const task = await this.visibleTaskOf(data.taskId, data);
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
    const target = await this.prisma.user.findUnique({
      where: { id: data.toUserId },
      select: { isExternal: true, organizationId: true, isActive: true },
    });
    if (!target || target.isExternal || target.organizationId !== task.organizationId || target.isActive === false) {
      throw new BadRequestException({
        message: 'They cannot lead this job.',
        code: CREW_CODES.LEAD_TARGET_NOT_ON_CREW,
      });
    }
    const scope: LeadScope = data.scope === 'PERMANENT' ? 'PERMANENT' : 'TODAY';
    // A member standing in for an absent leader hands over for today — never takes the job from them for good.
    if (scope === 'PERMANENT' && !office && leader.acting) {
      throw new ForbiddenException({
        message: 'Standing in, you can hand the lead over for today only.',
        code: CREW_CODES.LEAD_NOT_YOURS,
      });
    }
    const reason = cleanReason(data.reason);

    if (scope === 'TODAY') {
      const tz = await this.zoneOf(task);
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
          toName: await this.nameOf(data.toUserId),
          scope,
          by: leader.userId === data.userId ? 'LEADER' : 'OFFICE',
          ...(reason ? { reason } : {}),
        },
      },
    });
    if (data.toUserId !== data.userId) {
      const by = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { firstName: true, lastName: true },
      });
      emitEvent(this.notifications, taskLeadChangedEvent, {
        taskId: task.id,
        taskTitle: task.title,
        toUserId: data.toUserId,
        byName: personName(by),
        scope,
      });
    }
    const fresh = await this.taskOf(task.id, task.organizationId);
    this.changed(fresh, data.userId);
    return success(await this.viewOf(fresh));
  }
}
