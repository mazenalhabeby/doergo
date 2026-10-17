import { BUILTIN_ROLES, builtInRoleGrants, builtInRoleCreateData, SHARED_ROLE_WHERE } from '@hbcfield/shared';
import { Injectable } from '@nestjs/common';
import { Prisma, type RoleScope } from '@prisma/client';
import { AccessRolesBase } from './access-roles.base';
import { jsonColumn } from '../../common/records/json-column';

/**
 * Access roles: the built-ins that follow their definition, and the roles an
 * organization defines for itself.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class AccessRolesService extends AccessRolesBase {
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
          AND "personalAssignmentId" IS NULL
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
        // `permissions` is a typed permission set; the column is JSON.
        create: { ...builtInRoleCreateData(data.organizationId, p), permissions: jsonColumn(p.permissions) },
      });
    }
    await this.syncBuiltInRoles(data.organizationId);
    const scopes: RoleScope[] = data.scope === 'space' ? ['SPACE', 'BOTH'] : ['ORG', 'BOTH'];
    const [roles, holders] = await Promise.all([
      this.prisma.accessRole.findMany({
        // ⚠️ Never a personal role (one person's permissions in one workspace): it is nobody's to pick.
        where: { organizationId: data.organizationId, isActive: true, scope: { in: scopes }, ...SHARED_ROLE_WHERE },
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
}
