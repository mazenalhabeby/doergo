import { BadRequestException, Injectable } from '@nestjs/common';
import { CLOCK_GATE_CODES, activeAssignmentWhere, spaceRunsClock } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';

/**
 * "Clocked in to start work" (packages/shared/src/tasks/clock-gate.ts), asked
 * by every way onto a job: a step move into work, Resume, and joining a crew.
 * Its own service so the crew rules ask the SAME question the step moves ask.
 */
@Injectable()
export class ClockGateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The person doing the job must be on the clock to start or resume it.
   *
   * WHO is "the person": the mover, when they are on the job; otherwise (the
   * office moving it for them) whoever it is assigned to — any one of them
   * clocked in will do, since a crew shares a job. Nobody assigned: nobody to
   * hold to a clock. Rule and exemptions: packages/shared/src/tasks/clock-gate.ts.
   *
   * Asked only on a move INTO a working step, so the board's ordinary moves and
   * every other status change pay nothing for it. One indexed query
   * (time_entries [userId, status]) when it does run.
   */
  async assertWorkerClockedIn(
    task: { id: string; organizationId: string; spaceId?: string | null; assignedToId?: string | null },
    moverId: string,
    organizationId: string,
    moverIsOnTheJob: boolean,
  ): Promise<{ userId: string; clockInAt: Date } | null> {
    const where = task.spaceId
      ? await this.prisma.companyLocation.findUnique({
          where: { id: task.spaceId },
          select: { enabledModules: true, organization: { select: { enabledModules: true } } },
        })
      : null;
    const orgModules =
      where?.organization?.enabledModules ??
      (
        await this.prisma.organization.findUnique({
          where: { id: task.organizationId },
          select: { enabledModules: true },
        })
      )?.enabledModules;
    const jobRunsClock = spaceRunsClock(
      where?.enabledModules as string[] | null | undefined,
      orgModules as string[] | null | undefined,
    );

    let workerIds: string[];
    if (moverIsOnTheJob) {
      workerIds = [moverId];
    } else {
      const crew = await this.prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } });
      workerIds = [...new Set([task.assignedToId, ...crew.map((c) => c.userId)].filter((id): id is string => !!id))];
    }
    if (workerIds.length === 0) return null;

    /*
      ⚠️ THE RULE FOLLOWS THE PERSON, NOT ONLY THE JOB'S WORKSPACE. A job in a
      workspace with Time Tracking off (a warehouse, a depot) was started by
      somebody who clocks in every day at the office — the job's time and the
      timesheet disagreed again. So: where the job's workspace runs no clock,
      the worker is still held to one if they can clock in ANYWHERE (an active
      assignment to a workspace that runs Time Tracking — the same answer as
      their clock-in list). Somebody with no clock at all is never asked.
    */
    const heldIds = jobRunsClock ? workerIds : await this.workersWithAClock(workerIds, task.organizationId);
    if (heldIds.length === 0) return null;

    // External members hold no clock (EXTERNAL_FORBIDDEN_MODULES): never theirs to be on.
    const held = await this.prisma.user.findMany({
      where: { id: { in: heldIds }, organizationId: task.organizationId, isExternal: false },
      select: { id: true, firstName: true, lastName: true },
    });
    if (held.length === 0) return null;

    const onTheClock = await this.prisma.timeEntry.findFirst({
      where: { organizationId: task.organizationId, userId: { in: held.map((w) => w.id) }, status: 'CLOCKED_IN' },
      select: { userId: true, clockInAt: true },
    });
    if (onTheClock) return onTheClock;

    if (moverIsOnTheJob) {
      throw new BadRequestException({
        message: 'Clock in to start work on this job.',
        code: CLOCK_GATE_CODES.SELF,
      });
    }
    const name = `${held[0]!.firstName} ${held[0]!.lastName}`.trim();
    throw new BadRequestException({
      message: `${name} is not clocked in. They need to clock in before this job can start.`,
      code: CLOCK_GATE_CODES.ASSIGNEE,
      params: { name },
    });
  }

  /** Of these people, those who can clock in somewhere — the clock-in list's own rule, in one query. */
  async workersWithAClock(workerIds: string[], organizationId: string): Promise<string[]> {
    const rows = await this.prisma.spaceAssignment.findMany({
      where: {
        ...activeAssignmentWhere({ in: workerIds }),
        space: { organizationId, isActive: true, isRemote: false },
      },
      select: {
        userId: true,
        space: { select: { enabledModules: true, organization: { select: { enabledModules: true } } } },
      },
    });
    const withClock = new Set(
      rows
        .filter((r) =>
          spaceRunsClock(
            r.space.enabledModules as string[] | null,
            r.space.organization?.enabledModules as string[] | null,
          ),
        )
        .map((r) => r.userId),
    );
    return workerIds.filter((id) => withClock.has(id));
  }
}
