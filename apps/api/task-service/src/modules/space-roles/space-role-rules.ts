import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import {
  PrismaService,
  roleSlugsLike,
  spaceRoleInOrg,
  spaceRoleNamed,
  countPeopleInOrg,
  countSharedRolesInOrg,
  roleUsableOnAssignment,
} from '@hbcfield/shared';

/*
 * What the role services share: a role this organization owns, names and slugs,
 * routing references, and a workspace's work roles.
 */

/** Add a work role to a workspace's list, once. Idempotent; safe inside a transaction. */
export async function useWorkRoleIn(
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
export async function assertRoutingInOrg(
  prisma: PrismaService,
  organizationId: string,
  ids: { roleIds: string[]; userIds: string[] },
) {
  const roleIds = [...new Set(ids.roleIds)];
  const userIds = [...new Set(ids.userIds)];
  const [roles, users] = await Promise.all([
    roleIds.length ? countSharedRolesInOrg(prisma, roleIds, organizationId) : Promise.resolve(0),
    userIds.length ? countPeopleInOrg(prisma, userIds, organizationId) : Promise.resolve(0),
  ]);
  if (roles !== roleIds.length) throw new BadRequestException('A chosen role does not belong to this organization');
  if (users !== userIds.length) throw new BadRequestException('A chosen person does not belong to this organization');
}

/**
 * One role per name. A second "Electric" made in another workspace priced the
 * same trade twice and offered both in every picker; the role already carries
 * a day rate per workspace, which is what the second one was trying to do.
 * Refused with the existing role's id, so the screen can offer it instead.
 */
export async function assertNameFree(prisma: PrismaService, organizationId: string, name: string, excludeId?: string) {
  const clash = await spaceRoleNamed(prisma, organizationId, name, excludeId);
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
export async function getOwnedRole(
  prisma: PrismaService,
  organizationId: string,
  roleId: string,
  opts?: { assignmentId?: string | null },
) {
  const role = await spaceRoleInOrg(prisma, roleId, organizationId);
  if (!role || !roleUsableOnAssignment(role, opts?.assignmentId ?? null))
    throw new NotFoundException('Space role not found');
  return role;
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
export async function uniqueSlug(
  prisma: PrismaService,
  organizationId: string,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'role';

  const siblings = await roleSlugsLike(prisma, organizationId, base, excludeId);
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
