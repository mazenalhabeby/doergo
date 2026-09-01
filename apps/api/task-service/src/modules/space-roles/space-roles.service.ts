import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  BUILTIN_ROLES,
  ACCESS_PERMISSION_SCHEMA,
  type PermissionSet,
} from '@hbcfield/shared';

// Permission keys that make sense on a SPACE role.
const SPACE_PERMISSION_KEYS = ACCESS_PERMISSION_SCHEMA
  .filter((p) => p.scopes.includes('space'))
  .map((p) => p.key);

const userSelect = { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } };
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
  }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
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
      include: { user: userSelect, role: roleSelect },
      orderBy: { createdAt: 'asc' },
    });
    // Shape to match the old response (spaceRole → role, + routing arrays).
    return success(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        spaceId: m.spaceId,
        user: m.user,
        spaceRole: m.role,
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
  }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    await this.assertUserInOrg(data.organizationId, data.userId);
    if (data.spaceRoleId) await this.getOwnedRole(data.organizationId, data.spaceRoleId);

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

  private async assertUserInOrg(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found in this organization');
  }

  private async uniqueSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
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
}
