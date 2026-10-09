import {
  Role,
  BUILTIN_ROLES,
  PERMISSION_KEYS,
  permissionsFromOrgRole,
  permissionsExceed,
  type PermissionSet,
  builtInRoleGrants,
  builtInRoleCreateData,
  whitelistPermissions,
  permissionsForKind,
} from '@hbcfield/shared';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberAccessChecksService } from './member-access-checks.service';

/**
 * Access roles: the built-ins that follow their definition, and the roles an
 * organization defines for itself.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class AccessRolesService {
  private readonly logger = new Logger(AccessRolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessChecks: MemberAccessChecksService,
  ) {}

  /**
   * ⭐ BUILT-IN ROLES FOLLOW THEIR DEFINITION — ADDITIVELY, UNTIL AN ADMIN EDITS THEM.
   *
   * The lazy seed only ever CREATED a built-in, so a role seeded before its
   * definition gained a permission never received it (the Sales Rep who could
   * not add clients). Every built-in nobody has edited now gains what its
   * definition in code gains.
   *
   * ⚠️ ADD ONLY, NEVER REMOVE. Stored roles hold more than their definitions
   * (migrations granted canManageAssets to every Manager, for one), so copying
   * the definition over them would silently take access away. A removal from a
   * built-in stays a deliberate, reviewed migration.
   *
   * ⚠️ AN EDITED ROLE IS THE ORGANIZATION'S OWN (`isCustomized`). Unticked
   * permissions are stored as ABSENT, so "missing" cannot tell "never had it"
   * from "an admin took it away" — only the flag can, and code never re-grants
   * what an admin removed.
   *
   * Custom roles have no definition in code and are never touched. One
   * statement per built-in, and it writes only rows that actually lack
   * something, so a boot with nothing new writes nothing.
   */
  async syncBuiltInRoles(organizationId?: string): Promise<number> {
    let changed = 0;
    for (const p of BUILTIN_ROLES) {
      // The rule is shared with task-service's space-role panel (`builtin-role-sync` in shared);
      // here it runs as one statement per built-in instead of a read per organization.
      const granted = builtInRoleGrants(p);
      if (!Object.keys(granted).length) continue;
      const def = JSON.stringify(granted);
      changed += await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "roles"
        SET "permissions" = "permissions"::jsonb || ${def}::jsonb, "updatedAt" = NOW()
        WHERE "slug" = ${p.slug}
          AND "isSystem" = true
          AND "isCustomized" = false
          AND NOT ("permissions"::jsonb @> ${def}::jsonb)
          ${organizationId ? Prisma.sql`AND "organizationId" = ${organizationId}` : Prisma.empty}`);
    }
    if (changed) this.logger.log(`Built-in roles updated from their definitions: ${changed}`);
    return changed;
  }

  /**
   * List assignable roles, lazily seeding ALL built-ins so a fresh org always has
   * them. `scope='space'` → space roles (Space Manager / Shift Leader / …) for the
   * space pickers; default → org roles (Admin / Manager / custom) for the Access
   * panel. Org-scoped: id always from the caller's token.
   */
  async listAccessRoles(data: { organizationId: string; scope?: 'org' | 'space' }) {
    for (const p of BUILTIN_ROLES) {
      await this.prisma.accessRole.upsert({
        where: { organizationId_slug: { organizationId: data.organizationId, slug: p.slug } },
        update: {},
        create: builtInRoleCreateData(data.organizationId, p) as any,
      });
    }
    await this.syncBuiltInRoles(data.organizationId);
    const scopes = data.scope === 'space' ? ['SPACE', 'BOTH'] : ['ORG', 'BOTH'];
    const [roles, holders] = await Promise.all([
      this.prisma.accessRole.findMany({
        where: { organizationId: data.organizationId, isActive: true, scope: { in: scopes as any } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, slug: true, color: true, scope: true, isSystem: true, permissions: true },
      }),
      /*
        How many people hold each role, in ONE query.

        The screen listed "13 permissions" and never said who had them, so a role
        looked equally deletable whether nobody held it or half the company did —
        and the refusal only arrived after clicking Delete.

        A groupBy rather than a count per role: this list is short today, but a
        count inside the map is an N+1 that grows with exactly the thing an
        organization adds more of over time.

        Active members only. Somebody deactivated is not occupying a role in any
        sense the reader cares about, and counting them would explain a delete
        refusal by pointing at people who are no longer there.
      */
      this.prisma.user.groupBy({
        by: ['memberRoleId'],
        where: { organizationId: data.organizationId, isActive: true, memberRoleId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const held = new Map(holders.map((h) => [h.memberRoleId as string, h._count._all]));
    return {
      success: true,
      data: roles.map((r) => ({ ...r, memberCount: held.get(r.id) ?? 0 })),
    };
  }

  /**
   * Whitelist an incoming permissions object to the known keys (fail-closed).
   * The list is the shared one task-service also reads (`whitelistPermissions`),
   * so a role means the same thing whichever service saved it.
   */
  private sanitizeRolePermissions(input: unknown, scope: 'org' | 'space' = 'org'): PermissionSet {
    return whitelistPermissions(input, scope);
  }

  private async uniqueRoleSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
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
  private async sanitizeRolePermissionsForRequester(
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
    const role = await this.prisma.accessRole.findFirst({
      where: { id: data.roleId, organizationId: data.organizationId },
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
      where: { id: data.roleId, organizationId: data.organizationId },
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
