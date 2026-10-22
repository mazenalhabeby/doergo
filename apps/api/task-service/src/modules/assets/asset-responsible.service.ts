import { Injectable } from '@nestjs/common';
import { orgRoleGrants, orgWideActorIds } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { spaceRoleHolders } from '../../common/space-leaders.util';

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
    const roles = await orgRoleGrants(this.prisma, organizationId);
    const granting = roles.filter((r) => grants(r.permissions)).map((r) => r.id);

    return orgWideActorIds(this.prisma, { organizationId, grantingRoleIds: granting, exceptUserId });
  }

  /**
   * People whose SPACE role grants `canManageAssets` in one workspace — whoever
   * runs the depot runs its vans. Two queries whatever the size of the roster.
   */
  async spaceManagers(organizationId: string, spaceId: string | null | undefined, now = new Date()): Promise<string[]> {
    // The same "who leads this workspace" query attendance asks (space-leaders.util).
    return spaceRoleHolders(this.prisma as never, { organizationId, spaceId, grants, now });
  }
}

function grants(permissions: unknown): boolean {
  const p = (permissions ?? {}) as Record<string, unknown>;
  return p.canManageAssets === true || p.canManageUsers === true;
}
