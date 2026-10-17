import { PERMISSION_KEYS, type PermissionSet, whitelistPermissions } from '@hbcfield/shared';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberAccessChecksService } from './member-access-checks.service';

/**
 * What reading and writing roles share: a role's permissions cleaned, cleaned
 * against what the requester may grant, and a free slug.
 */
@Injectable()
export abstract class AccessRolesBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly accessChecks: MemberAccessChecksService,
  ) {}


  /**
   * Whitelist an incoming permissions object to the known keys (fail-closed).
   * The list is the shared one task-service also reads (`whitelistPermissions`),
   * so a role means the same thing whichever service saved it.
   */
  protected sanitizeRolePermissions(input: unknown, scope: 'org' | 'space' = 'org'): PermissionSet {
    return whitelistPermissions(input, scope);
  }

  protected async uniqueRoleSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'role';
    let slug = base;
    let n = 1;
    while (true) {
      const clash = await this.prisma.accessRole.findFirst({
        where: { organizationId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${base}-${++n}`;
    }
  }

  /**
   * Whitelist incoming permissions AND cap them at the requester's own ceiling.
   * A true ADMIN may author any permission; anyone else can only grant what they
   * already hold — so a non-admin `canManageUsers` holder can't mint a super-role.
   */
  protected async sanitizeRolePermissionsForRequester(
    input: unknown,
    requesterId: string | undefined,
    organizationId: string,
    scope: 'org' | 'space' = 'org',
  ): Promise<PermissionSet> {
    const requested = this.sanitizeRolePermissions(input, scope);
    if (!requesterId) return requested; // no requester context → whitelist only
    const { isAdmin, perms } = await this.accessChecks.resolveRequesterOrgPerms(requesterId, organizationId);
    if (isAdmin) return requested;
    const capped: PermissionSet = {};
    for (const key of PERMISSION_KEYS) {
      if (requested[key] === true && perms[key] === true) capped[key] = true;
    }
    return capped;
  }
}
