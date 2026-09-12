import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  cleanRateCents,
  resolveRate,
  BUILTIN_ROLES,
  ACCESS_PERMISSION_SCHEMA,
  permissionsExceed,
  permissionsFromOrgRole,
  externalForbiddenIn,
  permissionLabel,
  type PermissionSet,
} from '@hbcfield/shared';

// Permission keys that make sense on a SPACE role.
const SPACE_PERMISSION_KEYS = ACCESS_PERMISSION_SCHEMA
  .filter((p) => p.scopes.includes('space'))
  .map((p) => p.key);

// `position` is the free-form job title an admin typed — "IT Engineering",
// "Sales", "CEO". The member lists show it under the name, and a list that
// displays a field should carry it rather than have the browser join it back
// on from somewhere else.
const userSelect = {
  /*
    ⚠️ `isExternal` is here so the screen can tell the two apart. An external
    member works for a client or a partner, not for us — we neither pay them nor
    bill their hours, so a rate is meaningless on them, and the roster must be
    able to say so without a second request per row.
  */
  select: {
    id: true, firstName: true, lastName: true, email: true,
    avatarUrl: true, position: true, isExternal: true,
  },
};
const roleSelect = { select: { id: true, name: true, slug: true, color: true, permissions: true } };

/**
 * Space roles + space membership on the UNIFIED model (AccessRole scope=SPACE +
 * SpaceAssignment). Replaces the legacy SpaceRole/SpaceMember stack. Also stores
 * the per-member, per-space routing override (who is notified about / who this
 * member may contact within the space).
 *
 * Org-scoped: organizationId always from the caller's token; spaceId/userId are
 * verified in-org before use. Delegation (space-manager) is enforced at the
 * gateway against the resource's own spaceId.
 */
@Injectable()
export class SpaceRolesService {
  private readonly logger = new Logger(SpaceRolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Roles (AccessRole, scope SPACE) ────────────────────────────────────────

  async listRoles(data: { organizationId: string }) {
    await this.ensureBuiltInRoles(data.organizationId);
    const roles = await this.prisma.accessRole.findMany({
      where: { organizationId: data.organizationId, scope: { in: ['SPACE', 'BOTH'] } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { spaceAssignments: true } } },
    });
    return success(roles.map((r) => ({ ...r, _count: { members: r._count.spaceAssignments } })));
  }

  async createRole(data: {
    organizationId: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
  }) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('Role name is required');
    const slug = await this.uniqueSlug(data.organizationId, name);
    const max = await this.prisma.accessRole.aggregate({ where: { organizationId: data.organizationId }, _max: { position: true } });
    const role = await this.prisma.accessRole.create({
      data: {
        organizationId: data.organizationId,
        name,
        slug,
        description: data.description?.trim() || null,
        color: data.color || '#6b7280',
        scope: 'SPACE',
        isSystem: false,
        permissions: this.normalizePermissions(data.permissions) as any,
        position: (max._max.position ?? -1) + 1,
      },
    });
    return success(role, 'Space role created');
  }

  async updateRole(data: {
    organizationId: string;
    roleId: string;
    name?: string;
    description?: string;
    color?: string;
    permissions?: PermissionSet;
    isActive?: boolean;
    /** Ceiling on what the caller may author. Null/undefined = admin. */
    requesterPerms?: PermissionSet | null;
  }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    /*
      The ceiling applies to what the role ALREADY grants, not only to the edit.

      Otherwise somebody who could not have authored a role could still rename
      it, recolour it and hand it out — keeping every permission they were never
      allowed to give. The org role paths guard delete for the same reason.
    */
    if (data.requesterPerms && permissionsExceed(data.requesterPerms, permissionsFromOrgRole(role.permissions))) {
      throw new ForbiddenException('You cannot edit a role with permissions beyond your own');
    }
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Role name cannot be empty');
      patch.name = name;
      if (!role.isSystem) patch.slug = await this.uniqueSlug(data.organizationId, name, role.id);
    }
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.color !== undefined) patch.color = data.color;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.permissions !== undefined) {
      patch.permissions = this.normalizePermissions({
        ...(role.permissions as PermissionSet),
        ...data.permissions,
      }) as any;
    }
    const updated = await this.prisma.accessRole.update({ where: { id: role.id }, data: patch });
    return success(updated, 'Space role updated');
  }

  async deleteRole(data: { organizationId: string; roleId: string }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    if (role.isSystem) throw new BadRequestException('Built-in roles cannot be deleted (deactivate instead)');
    const inUse = await this.prisma.spaceAssignment.count({ where: { roleId: role.id } });
    if (inUse > 0) throw new BadRequestException(`This role is assigned to ${inUse} member(s). Reassign them first.`);
    await this.prisma.accessRole.delete({ where: { id: role.id } });
    return success({ id: role.id }, 'Space role deleted');
  }

  // ── Members (SpaceAssignment) ───────────────────────────────────────────────

  async listMembers(data: { organizationId: string; spaceId: string }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    const members = await this.prisma.spaceAssignment.findMany({
      where: { organizationId: data.organizationId, spaceId: data.spaceId },
      include: {
        user: userSelect,
        role: roleSelect,
      },
      orderBy: { createdAt: 'asc' },
    });

    /*
      What each member's rate WOULD be if this assignment stayed blank.

      ⚠️ Resolved HERE and sent down, rather than worked out in the browser. The
      order of the four levels is written down exactly once, in `resolveRate` —
      a second copy in a screen is a second answer to "why is this €40", and the
      first person to find them disagreeing is looking at an invoice.

      Two queries for the whole list, not one per row.
    */
    const [space, org, users] = await Promise.all([
      this.prisma.companyLocation.findUnique({
        where: { id: data.spaceId },
        select: { billableRateCents: true, costRateCents: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { billableRateCents: true, costRateCents: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: members.map((m) => m.userId) } },
        select: { id: true, billRateCents: true, costRateCents: true },
      }),
    ]);
    const byUser = new Map(users.map((u) => [u.id, u]));

    // Shape to match the old response (spaceRole → role, + routing arrays).
    return success(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        spaceId: m.spaceId,
        user: m.user,
        spaceRole: m.role,
        billRateCents: m.billRateCents,
        costRateCents: m.costRateCents,
        // What it falls back to — the ladder MINUS this assignment's own rung.
        inheritedBillRateCents: resolveRate('bill', {
          member: byUser.get(m.userId) ?? null,
          client: space
            ? { billRateCents: space.billableRateCents, costRateCents: space.costRateCents }
            : null,
          organization: org
            ? { billRateCents: org.billableRateCents, costRateCents: org.costRateCents }
            : null,
        }).cents,
        notifyRoleIds: m.notifyRoleIds,
        notifyUserIds: m.notifyUserIds,
        contactRoleIds: m.contactRoleIds,
        contactUserIds: m.contactUserIds,
        approveRoleIds: m.approveRoleIds,
        approveUserIds: m.approveUserIds,
      })),
    );
  }

  /** Assign (or re-assign) a member to a space with a space role. Idempotent. */
  async assignMember(data: {
    organizationId: string;
    spaceId: string;
    userId: string;
    spaceRoleId?: string | null; // AccessRole (space) id — name kept for API compat
    createdById?: string;
    /**
     * What the caller holds in this space — the ceiling on what they may hand
     * out. Undefined/null means no ceiling and is set ONLY for an admin, who
     * holds every permission and could never trip it.
     */
    requesterPerms?: PermissionSet | null;
  }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    const target = await this.assertUserInOrg(data.organizationId, data.userId);
    if (data.spaceRoleId) {
      const role = await this.getOwnedRole(data.organizationId, data.spaceRoleId);
      /*
        An external member may hold only what the allow-list permits.

        This is the ONE place a space role becomes real authority, so it is the
        place the ceiling belongs — a check in the gateway would have to read
        the role again and the two copies would be free to disagree. The
        allow-list is shared with the UI, which greys the same permissions out;
        this is what makes the greying true rather than decorative.
      */
      if (target.isExternal) {
        const forbidden = externalForbiddenIn(permissionsFromOrgRole(role.permissions));
        if (forbidden.length) {
          throw new ForbiddenException(
            `This role cannot be given to an external member — it grants ${forbidden
              .map((k) => permissionLabel(k))
              .join(', ')}`,
          );
        }
      }
      /*
        Nobody may grant what they do not hold.

        Checked here rather than at the gateway because this is where the role's
        permissions are read — a gateway-side check would have to fetch the role
        a second time, and the two copies would be free to disagree.

        This barely mattered while a space role carried four attendance
        permissions: the worst a space manager could do was make somebody an
        approver of overtime. A space role can now carry sixteen, including
        managing this space's members, deleting assets, the CRM client grants
        and location tracking — so handing one out is a real transfer of
        authority and needs the ceiling the org paths have always had.
      */
      if (data.requesterPerms && permissionsExceed(data.requesterPerms, permissionsFromOrgRole(role.permissions))) {
        throw new ForbiddenException('You cannot grant permissions beyond your own');
      }
    }

    const member = await this.prisma.spaceAssignment.upsert({
      where: { userId_spaceId: { userId: data.userId, spaceId: data.spaceId } },
      create: {
        organizationId: data.organizationId,
        spaceId: data.spaceId,
        userId: data.userId,
        roleId: data.spaceRoleId ?? null,
        createdById: data.createdById,
      },
      update: { roleId: data.spaceRoleId ?? null },
      include: { user: userSelect, role: roleSelect },
    });
    return success({ id: member.id, userId: member.userId, user: member.user, spaceRole: member.role }, 'Member assigned');
  }

  async removeMember(data: { organizationId: string; spaceId: string; memberId: string }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
    });
    if (!member) throw new NotFoundException('Space member not found');
    await this.prisma.spaceAssignment.delete({ where: { id: member.id } });
    return success({ id: member.id }, 'Member removed');
  }

  /** Set the per-member, per-space routing override. Whitelists ids to arrays. */
  /**
   * What this member is billed at, AT THIS CLIENT — the top rung of the ladder.
   *
   * ⚠️ This is where a customer-facing rate belongs. What somebody COSTS is a
   * fact about the person and follows them everywhere; what a client PAYS for
   * their hour is a fact about that client, and the same engineer is routinely
   * worth €45 at one customer and €60 at another. One field on the person
   * cannot express that, and forking the person's record per customer is worse.
   *
   * ⚠️ Undefined leaves the column alone; null clears it back to "inherit the
   * member's rate, then the client's, then the organisation's". Collapsing them
   * makes every save wipe a rate somebody set elsewhere.
   */
  async updateMemberRate(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    billRateCents?: number | null;
    costRateCents?: number | null;
  }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
      include: { user: { select: { isExternal: true } } },
    });
    if (!member) throw new NotFoundException('Space member not found');

    /*
      ⚠️ AN EXTERNAL MEMBER HAS NO RATE, and the server says so rather than
      trusting the screen to have hidden the field.

      They work for a client or a partner, not for us: we neither pay them nor
      bill their hours, so the number would mean nothing — and a stored one
      would quietly feed the ladder and land on an invoice. A list must not be
      looser than the check behind it.
    */
    if (member.user?.isExternal) {
      throw new BadRequestException('An external member has no billing rate — they do not work for you');
    }

    const patch: Record<string, number | null> = {};
    if (data.billRateCents !== undefined) patch.billRateCents = cleanRateCents(data.billRateCents);
    if (data.costRateCents !== undefined) patch.costRateCents = cleanRateCents(data.costRateCents);
    if (Object.keys(patch).length === 0) return success(member);

    const updated = await this.prisma.spaceAssignment.update({
      where: { id: member.id },
      data: patch,
      select: { id: true, billRateCents: true, costRateCents: true },
    });
    return success(updated);
  }

  async updateMemberRouting(data: {
    organizationId: string;
    spaceId: string;
    memberId: string;
    notifyRoleIds?: string[];
    notifyUserIds?: string[];
    contactRoleIds?: string[];
    contactUserIds?: string[];
    approveRoleIds?: string[];
    approveUserIds?: string[];
  }) {
    const member = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
    });
    if (!member) throw new NotFoundException('Space member not found');
    const arr = (v?: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
    const updated = await this.prisma.spaceAssignment.update({
      where: { id: member.id },
      data: {
        notifyRoleIds: arr(data.notifyRoleIds),
        notifyUserIds: arr(data.notifyUserIds),
        contactRoleIds: arr(data.contactRoleIds),
        contactUserIds: arr(data.contactUserIds),
        approveRoleIds: arr(data.approveRoleIds),
        approveUserIds: arr(data.approveUserIds),
      },
      select: {
        id: true,
        notifyRoleIds: true,
        notifyUserIds: true,
        contactRoleIds: true,
        contactUserIds: true,
        approveRoleIds: true,
        approveUserIds: true,
      },
    });
    return success(updated, 'Routing updated');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async ensureBuiltInRoles(organizationId: string) {
    // Seed any missing built-ins (idempotent by slug). Covers fresh orgs.
    for (const p of BUILTIN_ROLES) {
      await this.prisma.accessRole.upsert({
        where: { organizationId_slug: { organizationId, slug: p.slug } },
        update: {},
        create: {
          organizationId,
          name: p.name,
          slug: p.slug,
          description: p.description,
          color: p.color,
          scope: p.scope as any,
          isSystem: true,
          permissions: p.permissions as any,
        },
      });
    }
  }

  private normalizePermissions(input?: PermissionSet): PermissionSet {
    const out: PermissionSet = {};
    for (const key of SPACE_PERMISSION_KEYS) if (input?.[key] === true) out[key] = true;
    return out;
  }

  private async getOwnedRole(organizationId: string, roleId: string) {
    const role = await this.prisma.accessRole.findFirst({
      where: { id: roleId, organizationId, scope: { in: ['SPACE', 'BOTH'] } },
    });
    if (!role) throw new NotFoundException('Space role not found');
    return role;
  }

  private async assertSpaceInOrg(organizationId: string, spaceId: string) {
    const space = await this.prisma.companyLocation.findFirst({ where: { id: spaceId, organizationId }, select: { id: true } });
    if (!space) throw new NotFoundException('Space not found');
  }

  /** Tenancy check that also answers who the member works for — one query, both facts. */
  private async assertUserInOrg(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, isExternal: true },
    });
    if (!user) throw new NotFoundException('User not found in this organization');
    return user;
  }

  /**
   * A slug nothing else in the org is using.
   *
   * One query, and it terminates by construction. It used to be `while (true)`
   * around a findFirst — a loop with no bound whose only exit was the database
   * disagreeing, costing one round trip per collision and spinning forever if
   * that answer never came. Neither failure needs to be reachable to be worth
   * removing from a path that runs while a request is held open.
   *
   * Reading every sibling slug at once also makes the cost flat: ten roles
   * called "Shift Leader" cost one query, not ten.
   */
  private async uniqueSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'role';

    const siblings = await this.prisma.accessRole.findMany({
      where: {
        organizationId,
        slug: { startsWith: base },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { slug: true },
    });
    const taken = new Set(siblings.map((r) => r.slug));

    if (!taken.has(base)) return base;
    // Bounded by the number of rows that could possibly clash: with N siblings
    // taken, one of base-2 … base-(N+2) is necessarily free.
    for (let n = 2; n <= taken.size + 2; n++) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
    // Unreachable by the pigeonhole argument above; a slug that is unique
    // anyway beats throwing on a name.
    return `${base}-${Date.now()}`;
  }
}
