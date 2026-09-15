import { Injectable } from '@nestjs/common';
import { Role, activeAssignmentWhere } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Who can actually ACT on the organization's equipment.
 *
 * Asked by the two features whose silence is work that stops: a proposal
 * nobody is told about, and a service nobody is reminded of. Both route through
 * the member's watchers first; this is who it goes to when that is empty.
 *
 * ⚠️ `canManageAssets` is NOT a column on User. It is resolved at sign-in from
 * the member's roles, so finding the people who hold it means reading the roles
 * that grant it and then the people who hold those roles.
 */
@Injectable()
export class AssetResponsibleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Org-wide managers: admins, and org roles granting `canManageAssets` (or
   * `canManageUsers`, which is how sign-in resolves it too).
   */
  async orgManagers(organizationId: string, exceptUserId?: string): Promise<string[]> {
    const roles = await this.prisma.accessRole.findMany({
      where: { organizationId, isActive: true, scope: { not: 'SPACE' as never } },
      select: { id: true, permissions: true },
    });
    const granting = roles.filter((r) => grants(r.permissions)).map((r) => r.id);

    const people = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        isExternal: false,
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
        // An admin is one by being one, exactly as PermissionsGuard decides it.
        OR: [
          { role: Role.ADMIN as never },
          { canManageUsers: true },
          ...(granting.length ? [{ memberRoleId: { in: granting } }] : []),
        ],
      },
      select: { id: true },
      take: 25,
    });
    return people.map((p) => p.id);
  }

  /**
   * People whose SPACE role grants `canManageAssets` in one workspace — whoever
   * runs the depot runs its vans. Two queries whatever the size of the roster.
   */
  async spaceManagers(organizationId: string, spaceId: string | null | undefined, now = new Date()): Promise<string[]> {
    if (!spaceId) return [];
    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        organizationId,
        spaceId,
        roleId: { not: null },
        effectiveFrom: { lte: now },
        OR: activeAssignmentWhere('', now).OR,
        user: { isActive: true, isExternal: false },
      },
      select: { userId: true, role: { select: { isActive: true, permissions: true } } },
      take: 200,
    });
    return [...new Set(assignments.filter((a) => a.role?.isActive && grants(a.role.permissions)).map((a) => a.userId))];
  }
}

function grants(permissions: unknown): boolean {
  const p = (permissions ?? {}) as Record<string, unknown>;
  return p.canManageAssets === true || p.canManageUsers === true;
}
