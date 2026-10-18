import { Injectable } from '@nestjs/common';
import { success } from '@hbcfield/shared';
import { NEVER_WORKING } from './job-pause-helpers';
import { JobPauseBase } from './job-pause.base';

/** The caller's own paused jobs, waiting to be resumed. */
@Injectable()
export class JobPauseReadService extends JobPauseBase {
  /**
   * The member's own picture: what they are working on (the clock-out sheet),
   * what they owe a note for (asked on every open), and what is paused on them
   * (offered to resume at the next clock-in).
   */
  async mine(data: { userId: string; organizationId: string }) {
    const select = {
      id: true,
      title: true,
      status: true,
      pausedAt: true,
      pausedById: true,
      locationAddress: true,
      customer: { select: { name: true } },
    } as const;
    const [working, owed, paused] = await Promise.all([
      this.workingJobsOf(data.userId, data.organizationId),
      this.prisma.task.findMany({
        where: { organizationId: data.organizationId, handoverDueById: data.userId },
        select,
        orderBy: { pausedAt: 'desc' },
        take: 20,
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: data.organizationId,
          pausedAt: { not: null },
          status: { notIn: NEVER_WORKING },
          OR: [{ assignedToId: data.userId }, { assignees: { some: { userId: data.userId } } }],
        },
        select,
        orderBy: { pausedAt: 'desc' },
        take: 20,
      }),
    ]);
    const workingIds = working.map((w) => w.id);
    /*
      Everything below depends only on the three lists above, not on each other,
      so it is asked together: the open jobs' rows, the member's own time on the
      open and paused jobs, who carries on, and their open checklist items.
    */
    const [open, mins, carriesOn, openItems] = await Promise.all([
      workingIds.length
        ? this.prisma.task.findMany({ where: { id: { in: workingIds } }, select, take: 50 })
        : Promise.resolve([] as Array<Awaited<typeof paused>[number]>),
      // "Working 2h 15m" on the clock-out sheet, "2h 15m so far" on a paused job — the member's own share.
      this.prisma.task
        .findMany({
          where: { id: { in: [...new Set([...workingIds, ...paused.map((t) => t.id)])] } },
          select: { id: true, workflowId: true, spaceId: true, organizationId: true },
        })
        .then((refs) => this.jobTime.workedForMany(refs, data.userId)),
      // Which open jobs the crew carries on after this person clocks out (shared crew.ts) —
      // the clock-out sheet says "leave the crew a note" there, not "pauses".
      this.crewCarriesOn(working, data.userId, data.organizationId),
      // …and "2 of your items are still open" (shared tasks/checklist.ts): one grouped read on the
      // owner index, only for the jobs in work, only when there are any.
      workingIds.length
        ? this.prisma.checklistItem.groupBy({
            by: ['taskId'],
            where: { assigneeId: data.userId, isCompleted: false, taskId: { in: workingIds } },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ taskId: string; _count: { _all: number } }>),
    ]);
    const withTime = <T extends { id: string }>(list: T[]) =>
      list.map((t) => ({ ...t, workedMinutes: mins.get(t.id) ?? 0 }));
    const openOf = new Map(openItems.map((r) => [r.taskId, r._count._all]));
    return success({
      open: withTime(open).map((t) => ({
        ...t,
        crewContinues: carriesOn.has(t.id),
        myOpenItems: openOf.get(t.id) ?? 0,
      })),
      owed,
      paused: withTime(paused),
    });
  }
}
