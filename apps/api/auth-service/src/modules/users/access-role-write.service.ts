import {
  Role,
  PERMISSION_KEYS,
  permissionsFromOrgRole,
  permissionsExceed,
  permissionsForKind,
  SHARED_ROLE_WHERE,
} from '@hbcfield/shared';
import { Injectable, NotFoundException, BadRequestException, HttpStatus } from '@nestjs/common';
import { AccessRolesBase } from './access-roles.base';

/** Changing the organization's roles: adding one, editing it (within the grant ceiling), deleting it. */
@Injectable()
export class AccessRoleWriteService extends AccessRolesBase {

  /** Create a custom ORG-wide role. Permissions are whitelisted to known keys. */
  async createAccessRole(data: {
    organizationId: string;
    requesterId?: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: unknown;
  }) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('Role name is required');
    const slug = await this.uniqueRoleSlug(data.organizationId, name);
    const max = await this.prisma.accessRole.aggregate({
      where: { organizationId: data.organizationId },
      _max: { position: true },
    });
    const permissions = await this.sanitizeRolePermissionsForRequester(
      data.permissions,
      data.requesterId,
      data.organizationId,
    );
    const role = await this.prisma.accessRole.create({
      data: {
        organizationId: data.organizationId,
        name,
        slug,
        description: data.description?.trim() || null,
        color: data.color || '#6b7280',
        scope: 'ORG',
        isSystem: false,
        permissions: permissions as any,
        position: (max._max.position ?? -1) + 1,
      },
      select: { id: true, name: true, slug: true, color: true, scope: true, isSystem: true, permissions: true },
    });
    return { success: true, data: role, message: 'Role created' };
  }

  /** Update a role. Built-in roles: name/permissions editable, slug kept stable. */
  async updateAccessRole(data: {
    organizationId: string;
    requesterId?: string;
    roleId: string;
    name?: string;
    description?: string;
    color?: string;
    permissions?: unknown;
  }) {
    // A personal role is edited only through the workspace permission builder — here it does not exist.
    const role = await this.prisma.accessRole.findFirst({
      where: { id: data.roleId, organizationId: data.organizationId, ...SHARED_ROLE_WHERE },
    });
    if (!role) throw new NotFoundException('Role not found');

    /*
      Ceiling on what the role IS, not only on what it will be.

      Checking the new set alone let a non-admin rename, recolour or strip the
      admin-grade role — or rewrite a role above them down to their own level and
      take everyone holding it with it. The same rule `deleteAccessRole` applies:
      a role beyond your own is not yours to edit.
    */
    if (data.requesterId) {
      const { isAdmin, perms } = await this.accessChecks.resolveRequesterOrgPerms(data.requesterId, data.organizationId);
      if (!isAdmin && permissionsExceed(perms, permissionsFromOrgRole(role.permissions))) {
        return {
          success: false as const,
          statusCode: HttpStatus.FORBIDDEN,
          message: 'You cannot edit a role with permissions beyond your own',
        };
      }
    }

    /*
      You cannot narrow a role you yourself hold.

      This happened in production on 2026-08-31. An admin tried to delete two
      leftover roles, was refused because a member still held one, and emptied
      the permissions instead — a reasonable workaround: if it cannot be removed,
      at least let it grant nothing. The member holding it was them. Their own
      access came from that role, so the whole administration navigation vanished
      and only a direct database write brought it back.

      `updateMemberProfile` already refuses to let anybody change their OWN role,
      for exactly this reason. Editing the role they hold is the same act through
      a different door, and it was not guarded.

      Deliberately narrow: only a REMOVAL is refused, and only for a permission
      the editor currently holds. Renaming, recolouring and ADDING permissions to
      your own role all stay allowed — the danger is losing access you are relying
      on this second, not editing the role at all.

      Admins are exempt because they no longer resolve their access from a role
      (see buildResolvedAccess) — for them this is no longer a way to lose
      anything, and refusing would block a legitimate tidy-up.
    */
    if (data.permissions !== undefined && data.requesterId) {
      const requester = await this.prisma.user.findFirst({
        where: { id: data.requesterId, organizationId: data.organizationId },
        select: { role: true, memberRoleId: true },
      });
      if (requester && requester.role !== Role.ADMIN && requester.memberRoleId === role.id) {
        const before = permissionsFromOrgRole(role.permissions);
        const after = this.sanitizeRolePermissions(data.permissions);
        const losing = PERMISSION_KEYS.filter((k) => before[k] === true && after[k] !== true);
        if (losing.length > 0) {
          return {
            success: false as const,
            statusCode: HttpStatus.CONFLICT,
            message:
              `You hold this role, so removing ${losing.length === 1 ? 'that permission' : 'those permissions'} would take away your own access. ` +
              `Ask an admin, or move yourself to another role first.`,
          };
        }
      }
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Role name cannot be empty');
      patch.name = name;
      if (!role.isSystem) patch.slug = await this.uniqueRoleSlug(data.organizationId, name, role.id);
    }
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.color !== undefined) patch.color = data.color;
    if (data.permissions !== undefined) {
      /*
        A WORK role (a trade) grants NOTHING — its permissions are forced empty
        on every write. task-service's own role routes already did that; this
        door did not, so the same "Electrician" could be given canManageUsers
        here and every holder would inherit it while every screen still
        described it as a trade. `permissionsForKind` is the one rule.
        A SPACE role is whitelisted to the keys that mean something in a space.
      */
      const sanitized = await this.sanitizeRolePermissionsForRequester(
        data.permissions,
        data.requesterId,
        data.organizationId,
        role.scope === 'SPACE' ? 'space' : 'org',
      );
      patch.permissions = permissionsForKind(
        role.kind === 'WORK' ? 'WORK' : 'MANAGEMENT',
        sanitized as Record<string, boolean>,
      ) as any;
      /*
        A built-in whose permissions an admin CHANGES becomes theirs: code never
        adds to it again (see syncBuiltInRoles). Saving the same set is not a
        change — a rename or a colour does not stop a role following its definition.
      */
      const granted = (x: unknown) => Object.entries((x ?? {}) as Record<string, unknown>)
        .filter(([, v]) => v === true).map(([k]) => k).sort().join(',');
      if (role.isSystem && granted(patch.permissions) !== granted(role.permissions)) patch.isCustomized = true;
    }
    const updated = await this.prisma.accessRole.update({
      where: { id: role.id },
      data: patch,
      select: { id: true, name: true, slug: true, color: true, scope: true, isSystem: true, permissions: true },
    });
    return { success: true, data: updated, message: 'Role updated' };
  }

  /**
   * Delete a custom role. System roles are protected; in-use roles are blocked.
   *
   * Refusals are RETURNED, not thrown.
   *
   * A `BadRequestException` raised inside a @MessagePattern handler does not
   * survive the trip to the gateway: Nest serialises it across Redis as
   * `{ status: 'error', message }`, the HTTP status is gone, and what arrives is
   * no longer an HttpException — so the gateway's filter falls through to its
   * default and answers **500 Internal server error**. The caller then sees a
   * crash where the server actually made a correct, explainable decision.
   *
   * The gateway already reads this shape (`if (result.success === false) throw
   * new HttpException(...)`), so returning is the convention here; throwing was
   * the anomaly. Every refusal below carries the status the caller should see.
   */
  async deleteAccessRole(data: { organizationId: string; requesterId?: string; roleId: string }) {
    const refuse = (statusCode: number, message: string) => ({ success: false as const, statusCode, message });

    const role = await this.prisma.accessRole.findFirst({
      where: { id: data.roleId, organizationId: data.organizationId, ...SHARED_ROLE_WHERE },
    });
    if (!role) return refuse(HttpStatus.NOT_FOUND, 'Role not found');
    if (role.isSystem) return refuse(HttpStatus.BAD_REQUEST, 'Built-in roles cannot be deleted');
    // Ceiling guard (S4): a non-admin may only delete a role whose permissions are
    // within their own — consistent with create/update authoring.
    if (data.requesterId) {
      const { isAdmin, perms } = await this.accessChecks.resolveRequesterOrgPerms(data.requesterId, data.organizationId);
      if (!isAdmin && permissionsExceed(perms, permissionsFromOrgRole(role.permissions))) {
        return refuse(HttpStatus.FORBIDDEN, 'You cannot delete a role with permissions beyond your own');
      }
    }
    const inUse = await this.prisma.user.count({ where: { memberRoleId: role.id } });
    if (inUse > 0) {
      // The sentence somebody can act on: it says how many, and what to do.
      return refuse(
        HttpStatus.CONFLICT,
        `This role is still assigned to ${inUse} member${inUse === 1 ? '' : 's'}. Move them to another role first, then delete it.`,
      );
    }
    await this.prisma.accessRole.delete({ where: { id: role.id } });
    return { success: true, data: { id: role.id }, message: 'Role deleted' };
  }
}
