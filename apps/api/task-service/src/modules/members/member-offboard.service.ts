import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { AssetCustodyService } from '../assets/asset-custody.service';

export interface OffboardResult {
  tasksReleased: number;
  assignmentsEnded: number;
  assetsReturned: number;
  schedulesRemoved: number;
  timeOffErased: number;
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
    const { count } = await this.prisma.spaceAssignment.deleteMany({
      where: { spaceId: data.spaceId, organizationId: data.guestOrgId },
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
    // The weekly working pattern belongs to a member who works here; a leaver has none.
    const { count: schedulesRemoved } = await this.prisma.technicianSchedule.deleteMany({
      where: { technicianId: userId },
    });
    const { count: timeOffErased } = data.erase
      ? await this.prisma.timeOff.deleteMany({ where: { technicianId: userId } })
      : { count: 0 };
    this.logger.log(
      `Offboarded member ${userId}: ${tasksReleased} jobs released, ${assetsReturned} assets returned, ${assignmentsEnded} ` +
        `assignments ended, ${schedulesRemoved} schedules removed${data.erase ? `, ${timeOffErased} leave records erased` : ''}`,
    );
    return { tasksReleased, assignmentsEnded, assetsReturned, schedulesRemoved, timeOffErased };
  }
}
