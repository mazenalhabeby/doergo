import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  success,
  BUILTIN_SPACE_ROLES,
  SPACE_ROLE_PERMISSION_SCHEMA,
  type SpaceRolePermissions,
} from '@hbcfield/shared';

const PERMISSION_KEYS = SPACE_ROLE_PERMISSION_SCHEMA.map((p) => p.key);

/**
 * Dynamic per-space sub-roles (e.g. "Shift Leader", "Team Leader") and the
 * membership that assigns them to people in a space. These drive overtime
 * approval + escalation routing in the attendance reminder engine.
 *
 * Everything is org-scoped: the organizationId always comes from the caller's
 * token (never the request body), and any spaceId/userId is verified to belong
 * to that org before use.
 */
@Injectable()
export class SpaceRolesService {
  private readonly logger = new Logger(SpaceRolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Roles ────────────────────────────────────────────────────────────────

  /** List an org's space roles (lazily seeding the built-ins on first access). */
  async listRoles(data: { organizationId: string }) {
    const query = () =>
      this.prisma.spaceRole.findMany({
        where: { organizationId: data.organizationId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { members: true } } },
      });
    // Fetch first; only seed (and re-fetch) when the org has no roles yet — avoids
    // a permanent extra count() on every list once seeded.
    let roles = await query();
    if (roles.length === 0) {
      await this.ensureBuiltInRoles(data.organizationId);
      roles = await query();
    }
    return success(roles);
  }

  async createRole(data: {
    organizationId: string;
    name: string;
    description?: string;
    color?: string;
    permissions?: Partial<SpaceRolePermissions>;
  }) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('Role name is required');

    const slug = await this.uniqueSlug(data.organizationId, name);
    const role = await this.prisma.spaceRole.create({
      data: {
        organizationId: data.organizationId,
        name,
        slug,
        description: data.description?.trim() || null,
        color: data.color || '#6b7280',
        isSystem: false,
        permissions: this.normalizePermissions(data.permissions),
        position: await this.nextPosition(data.organizationId),
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
    permissions?: Partial<SpaceRolePermissions>;
    isActive?: boolean;
  }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Role name cannot be empty');
      patch.name = name;
      // Re-slug only for custom roles; keep built-in slugs stable (routing depends on them).
      if (!role.isSystem) patch.slug = await this.uniqueSlug(data.organizationId, name, role.id);
    }
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.color !== undefined) patch.color = data.color;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.permissions !== undefined) {
      patch.permissions = this.normalizePermissions({
        ...(role.permissions as SpaceRolePermissions),
        ...data.permissions,
      });
    }

    const updated = await this.prisma.spaceRole.update({ where: { id: role.id }, data: patch });
    return success(updated, 'Space role updated');
  }

  async deleteRole(data: { organizationId: string; roleId: string }) {
    const role = await this.getOwnedRole(data.organizationId, data.roleId);
    if (role.isSystem) {
      throw new BadRequestException('Built-in roles cannot be deleted (you can deactivate them instead)');
    }
    // Members keep their row; their spaceRoleId is set null by the FK (onDelete: SetNull).
    await this.prisma.spaceRole.delete({ where: { id: role.id } });
    return success({ id: role.id }, 'Space role deleted');
  }

  // ── Members ──────────────────────────────────────────────────────────────

  async listMembers(data: { organizationId: string; spaceId: string }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    const members = await this.prisma.spaceMember.findMany({
      where: { organizationId: data.organizationId, spaceId: data.spaceId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        spaceRole: { select: { id: true, name: true, slug: true, color: true, permissions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return success(members);
  }

  /** Assign (or re-assign) a member to a space with a sub-role. Idempotent per (user, space). */
  async assignMember(data: {
    organizationId: string;
    spaceId: string;
    userId: string;
    spaceRoleId?: string | null;
    createdById?: string;
  }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    await this.assertUserInOrg(data.organizationId, data.userId);
    if (data.spaceRoleId) await this.getOwnedRole(data.organizationId, data.spaceRoleId);

    const member = await this.prisma.spaceMember.upsert({
      where: { userId_spaceId: { userId: data.userId, spaceId: data.spaceId } },
      create: {
        organizationId: data.organizationId,
        spaceId: data.spaceId,
        userId: data.userId,
        spaceRoleId: data.spaceRoleId ?? null,
        createdById: data.createdById,
      },
      update: { spaceRoleId: data.spaceRoleId ?? null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        spaceRole: { select: { id: true, name: true, slug: true, color: true, permissions: true } },
      },
    });
    return success(member, 'Member assigned');
  }

  async removeMember(data: { organizationId: string; spaceId: string; memberId: string }) {
    const member = await this.prisma.spaceMember.findFirst({
      where: { id: data.memberId, organizationId: data.organizationId, spaceId: data.spaceId },
    });
    if (!member) throw new NotFoundException('Space member not found');
    await this.prisma.spaceMember.delete({ where: { id: member.id } });
    return success({ id: member.id }, 'Member removed');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Seed the built-in roles for an org exactly once (idempotent by slug). */
  private async ensureBuiltInRoles(organizationId: string) {
    const existing = await this.prisma.spaceRole.count({ where: { organizationId } });
    if (existing > 0) return;
    try {
      await this.prisma.spaceRole.createMany({
        data: BUILTIN_SPACE_ROLES.map((r, i) => ({
          organizationId,
          name: r.name,
          slug: r.slug,
          description: r.description,
          color: r.color,
          isSystem: true,
          permissions: r.permissions,
          position: i,
        })),
        skipDuplicates: true,
      });
      this.logger.log(`Seeded ${BUILTIN_SPACE_ROLES.length} built-in space roles for org ${organizationId}`);
    } catch (err) {
      // A concurrent request may have seeded them first — safe to ignore.
      this.logger.warn(`Built-in space role seed skipped for org ${organizationId}: ${err}`);
    }
  }

  private normalizePermissions(input?: Partial<SpaceRolePermissions>): SpaceRolePermissions {
    const out = {} as SpaceRolePermissions;
    for (const key of PERMISSION_KEYS) out[key] = input?.[key] === true;
    return out;
  }

  private async getOwnedRole(organizationId: string, roleId: string) {
    const role = await this.prisma.spaceRole.findFirst({ where: { id: roleId, organizationId } });
    if (!role) throw new NotFoundException('Space role not found');
    return role;
  }

  private async assertSpaceInOrg(organizationId: string, spaceId: string) {
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: spaceId, organizationId },
      select: { id: true },
    });
    if (!space) throw new NotFoundException('Space not found');
  }

  private async assertUserInOrg(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found in this organization');
  }

  private async nextPosition(organizationId: string): Promise<number> {
    const max = await this.prisma.spaceRole.aggregate({
      where: { organizationId },
      _max: { position: true },
    });
    return (max._max.position ?? -1) + 1;
  }

  /** Slugify a name and guarantee uniqueness within the org (excluding one role id). */
  private async uniqueSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'role';
    let slug = base;
    let n = 1;
    // Rare collision loop; org role counts are tiny.
    while (true) {
      const clash = await this.prisma.spaceRole.findFirst({
        where: { organizationId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${base}-${++n}`;
    }
  }
}
