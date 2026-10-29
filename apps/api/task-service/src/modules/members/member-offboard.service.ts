import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { TasksService } from '../tasks/tasks.service';
import { AssetCustodyService } from '../assets/custody/asset-custody.service';
import { ShiftCloser } from '../attendance/clock-out/shift-closer.service';
import { closeShiftsOfLeaver } from '../attendance/entries/leaver-close';
import { dropUpcomingShifts, endRotaFor } from '../shifts/rota-end';

export interface OffboardResult {
  tasksReleased: number;
  assignmentsEnded: number;
  assetsReturned: number;
  schedulesRemoved: number;
  timeOffErased: number;
  shiftsClosed: number;
  rotaEnded: number;
}

/**
 * Somebody leaves the organization — the part task-service owns.
 *
 * ⚠️ ONE PATH FOR EVERY WAY OF LEAVING. Removal, self-deletion and account
 * deletion each used to write task-service's tables from auth-service, and the
 * three disagreed: one reset EVERY task the person had ever held back to NEW
 * (finished history included), none touched the crew rows or a role task's
 * places, and none closed equipment custody, so a van kept being charged to
 * somebody who had gone. auth-service now asks this, and only this.
 *
 * Idempotent: running it twice finds nothing open the second time.
 */
@Injectable()
export class MemberOffboardService {
  private readonly logger = new Logger(MemberOffboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly custody: AssetCustodyService,
    private readonly closer: ShiftCloser,
  ) {}

  /**
   * A shared workspace was revoked: the guest organization's people leave THAT
   * workspace. Only their assignments there end — the guest org's other
   * workspaces and the owner's own people are untouched. Asked by auth-service
   * after it marks the share REVOKED; idempotent, so a retry of the revoke is safe.
   */
  async releaseSharedSpace(data: {
    ownerOrgId: string;
    spaceId: string;
    guestOrgId: string;
  }): Promise<{ assignmentsRemoved: number }> {
    // The space must be the OWNER's — a guest org id alone must never empty somebody else's workspace.
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: data.spaceId, organizationId: data.ownerOrgId },
      select: { id: true },
    });
    if (!space || data.guestOrgId === data.ownerOrgId) return { assignmentsRemoved: 0 };
    const where = { spaceId: data.spaceId, organizationId: data.guestOrgId };
    const people = await this.prisma.spaceAssignment.findMany({ where, select: { userId: true } });
    // Off the roster and off the rota there, together (rota-end.ts) — or the guests stay expected every day.
    const count = await this.prisma.$transaction(async (tx) => {
      const removed = await tx.spaceAssignment.deleteMany({ where });
      if (people.length) {
        await endRotaFor(tx, { spaceId: data.spaceId, userId: { in: people.map((p) => p.userId) } });
      }
      return removed.count;
    });
    this.logger.log(`Share revoked on ${data.spaceId}: ${count} guest assignments removed`);
    return { assignmentsRemoved: count };
  }

  /**
   * @param erase  The person is deleting their ACCOUNT (right to erasure): their
   *               leave records go too. A removal by an admin keeps them — the
   *               organization's own record of absences outlives a departure.
   */
  async offboard(data: {
    organizationId: string;
    userId: string;
    actorId: string;
    erase?: boolean;
  }): Promise<OffboardResult> {
    const { organizationId, userId, actorId } = data;
    // A shift still running closes first, through the office close (its jobs pause with it) — nobody is left to.
    const shiftsClosed = await closeShiftsOfLeaver(this.closer, this.prisma, { organizationId, userId });
    const tasksReleased = await this.tasks.releaseMemberFromOpenWork(organizationId, userId, actorId);
    const assetsReturned = await this.custody.releaseAllHeldBy(organizationId, userId, actorId);
    /*
      Workspace assignments END rather than disappear: the dated rows are what
      a past invoice's rates and a past rota were read from. A row already
      ended keeps its own date.
    */
    const now = new Date();
    const { count: assignmentsEnded } = await this.prisma.spaceAssignment.updateMany({
      where: { userId, space: { organizationId }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      data: { effectiveTo: now },
    });
    // …and so does their rota, everywhere here: a leaver left planned was a no-show every day (rota-end.ts).
    const { rotaEnded } = await endRotaFor(this.prisma, { organizationId, userId }, now);
    // The weekly working pattern belongs to a member who works here; a leaver has none.
    const { count: schedulesRemoved } = await this.prisma.technicianSchedule.deleteMany({
      where: { technicianId: userId },
    });
    const { count: timeOffErased } = data.erase
      ? await this.prisma.timeOff.deleteMany({ where: { technicianId: userId } })
      : { count: 0 };
    this.logger.log(
      `Offboarded member ${userId}: ${tasksReleased} jobs released, ${assetsReturned} assets returned, ${assignmentsEnded} ` +
        `assignments ended, ${rotaEnded} rota rows ended, ${shiftsClosed} open shifts closed, ` +
        `${schedulesRemoved} schedules removed${data.erase ? `, ${timeOffErased} leave records erased` : ''}`,
    );
    return {
      tasksReleased,
      assignmentsEnded,
      assetsReturned,
      schedulesRemoved,
      timeOffErased,
      shiftsClosed,
      rotaEnded,
    };
  }

  /**
   * A member switched off (deactivated). Reversible, so nothing they hold is released and their rota stays for
   * when they come back — but a shift still running closes (nobody can clock out of it now) and the shifts still
   * ahead are not expected (no no-show chasing for somebody who cannot clock in). Idempotent.
   */
  async deactivated(data: { organizationId: string; userId: string }): Promise<{ shiftsClosed: number }> {
    const shiftsClosed = await closeShiftsOfLeaver(this.closer, this.prisma, data);
    await dropUpcomingShifts(this.prisma, data);
    return { shiftsClosed };
  }

  /**
   * Right to erasure, whatever organization they are (or are no longer) in: their comments on jobs.
   * Asked by auth-service's account deletion — task-service owns comments. Safe to repeat.
   */
  async eraseMember(userId: string): Promise<{ success: true; data: { commentsRemoved: number } }> {
    const { count } = await this.prisma.comment.deleteMany({ where: { userId } });
    return { success: true, data: { commentsRemoved: count } };
  }
}
