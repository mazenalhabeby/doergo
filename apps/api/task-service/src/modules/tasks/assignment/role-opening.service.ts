import { BadRequestException, Injectable } from '@nestjs/common';
import { activeWindowWhere, parseRoleSpots, workRoleInOrg, PrismaService } from '@hbcfield/shared';
import { ROLE_WAVE_CLOSED, OpenRole } from './role-pool-helpers';

/**
 * Opening a task to a WORK role, and keeping its places in step with the crew — the part of the role
 * pool that touches only the database. Its own service so assignment (which syncs places after every
 * crew change) and the role pool (which needs assignment to take a place) share it without a cycle.
 * Moved unchanged from RolePoolBase (code-structure-fix 4.1).
 */
@Injectable()
export class RoleOpeningService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The role a task may be opened to: a WORK role of this organization that is
   * in use in this workspace (switched on there, or held by somebody there).
   * Refusals carry a code the screen can word.
   */
  async resolveOpenRole(organizationId: string, spaceId: string | null | undefined, roleId: string): Promise<OpenRole> {
    if (!spaceId) {
      throw new BadRequestException({
        message: 'Choose a workspace to open a task to a role',
        code: 'ROLE_TASK_NEEDS_SPACE',
      });
    }
    const [role, space] = await Promise.all([
      workRoleInOrg(this.prisma, roleId, organizationId),
      this.prisma.companyLocation.findFirst({
        where: { id: spaceId, organizationId },
        select: { workRoleIds: true },
      }),
    ]);
    if (!role || !space) {
      throw new BadRequestException({ message: 'That work role does not exist here', code: 'ROLE_TASK_ROLE_UNKNOWN' });
    }
    if (!space.workRoleIds.includes(role.id)) {
      const holder = await this.prisma.spaceAssignment.findFirst({
        where: { spaceId, workRoleId: role.id, ...activeWindowWhere(new Date()) },
        select: { id: true },
      });
      if (!holder) {
        throw new BadRequestException({
          message: `${role.name} is not used in this workspace`,
          code: 'ROLE_TASK_ROLE_NOT_HERE',
        });
      }
    }
    return role;
  }

  /** The columns a task carries when it is opened to a role — for `create` and `setOpenRole`. */
  openColumns(roleId: string, spots: unknown, now = new Date()) {
    const n = parseRoleSpots(spots);
    return { openRoleId: roleId, openSpots: n, openSpotsLeft: n, openedAt: now, openWave: 0 };
  }

  /**
   * The places left = asked for − people on the task, however the crew changed
   * (a take, a hand-back, the office's own picker, a decline). One statement,
   * computed in the database, so it can never drift from the crew rows or race
   * a take into a wrong absolute number. Nothing for a task not open to a role.
   */
  async syncSpots(taskId: string): Promise<void> {
    // openWave 3 = closed at a finished step: places never reopen on it.
    await this.prisma.$executeRaw`
      UPDATE "tasks" t
      SET "openSpotsLeft" = GREATEST(0, t."openSpots" - (SELECT COUNT(*) FROM "task_assignees" a WHERE a."taskId" = t."id"))::int
      WHERE t."id" = ${taskId} AND t."openRoleId" IS NOT NULL AND t."openSpots" IS NOT NULL AND t."openWave" < ${ROLE_WAVE_CLOSED}`;
  }
}
