import { Injectable, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type PermissionSet, SHARED_ROLE_WHERE, roleUsableOnAssignment } from '@hbcfield/shared';
import { SPACE_PERMISSION_KEYS } from './space-roles-helpers';
import type { Prisma } from '@prisma/client';

/**
 * What the role services share: built-in roles, a role this organization owns,
 * names and slugs, permission sets, and routing references.
 */
@Injectable()
export abstract class SpaceRolesBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly prisma: PrismaService) {}

  /** Add a work role to a workspace's list, once. Idempotent; safe inside a transaction. */
  protected async useWorkRoleIn(
    db: { $executeRawUnsafe: PrismaService['$executeRawUnsafe'] },
    spaceId: string,
    roleId: string,
  ) {
    await db.$executeRawUnsafe(
      `UPDATE "company_locations" SET "workRoleIds" = array_append("workRoleIds", $1) WHERE "id" = $2 AND NOT ($1 = ANY("workRoleIds"))`,
      roleId,
      spaceId,
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Every role and person named in a member's routing belongs to THIS
   * organization.
   *
   * The ids were stored as sent. Routing is read back by the notification and
   * chat resolvers, so a foreign user id here meant another organization's
   * member was pushed about this one's shifts and could be offered as a contact
   * — and a made-up id simply sat in the row. Refused as a whole (400), never
   * filtered: a save that quietly drops half of what was chosen reads as saved.
   */
  protected async assertRoutingInOrg(organizationId: string, ids: { roleIds: string[]; userIds: string[] }) {
    const roleIds = [...new Set(ids.roleIds)];
    const userIds = [...new Set(ids.userIds)];
    const [roles, users] = await Promise.all([
      roleIds.length
        ? this.prisma.accessRole.count({ where: { id: { in: roleIds }, organizationId, ...SHARED_ROLE_WHERE } })
        : Promise.resolve(0),
      userIds.length ? this.prisma.user.count({ where: { id: { in: userIds }, organizationId } }) : Promise.resolve(0),
    ]);
    if (roles !== roleIds.length) throw new BadRequestException('A chosen role does not belong to this organization');
    if (users !== userIds.length) throw new BadRequestException('A chosen person does not belong to this organization');
  }

  protected normalizePermissions(input?: PermissionSet): PermissionSet {
    const out: PermissionSet = {};
    for (const key of SPACE_PERMISSION_KEYS) if (input?.[key] === true) out[key] = true;
    return out;
  }

  /**
   * One role per name. A second "Electric" made in another workspace priced the
   * same trade twice and offered both in every picker; the role already carries
   * a day rate per workspace, which is what the second one was trying to do.
   * Refused with the existing role's id, so the screen can offer it instead.
   */
  protected async assertNameFree(organizationId: string, name: string, excludeId?: string) {
    const clash = await this.prisma.accessRole.findFirst({
      where: {
        organizationId,
        scope: { in: ['SPACE', 'BOTH'] },
        // A personal role's name ("Ann Lee · Site A") is nobody's to collide with.
        ...SHARED_ROLE_WHERE,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new ConflictException({
        message: `A role called "${clash.name}" already exists`,
        code: 'ROLE_NAME_TAKEN',
        params: { roleId: clash.id, name: clash.name },
      });
    }
  }

  /**
   * A space role of this organization. ⚠️ Never another person's PERSONAL role:
   * with no assignment named, any personal role reads as not found (editing,
   * merging, deleting, pricing them is the builder's job alone); with one named,
   * only that assignment's own personal role is usable on it
   * (`roleUsableOnAssignment`). Otherwise somebody's private grant becomes a
   * role anyone can hand out by id.
   */
  protected async getOwnedRole(organizationId: string, roleId: string, opts?: { assignmentId?: string | null }) {
    const role = await this.prisma.accessRole.findFirst({
      where: { id: roleId, organizationId, scope: { in: ['SPACE', 'BOTH'] } },
    });
    if (!role || !roleUsableOnAssignment(role, opts?.assignmentId ?? null))
      throw new NotFoundException('Space role not found');
    return role;
  }

  /**
   * An assignment that no longer holds its personal role must not keep one: a
   * stale personal role would come back the moment the builder reads "is there
   * one already?". Deleted in the same breath as the change that orphaned it.
   */
  protected async dropStalePersonalRole(assignmentId: string, keepRoleId: string | null) {
    await this.prisma.accessRole.deleteMany({
      where: { personalAssignmentId: assignmentId, ...(keepRoleId ? { id: { not: keepRoleId } } : {}) },
    });
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
  protected async uniqueSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'role';

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
