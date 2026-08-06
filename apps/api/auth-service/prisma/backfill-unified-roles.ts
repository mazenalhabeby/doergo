/**
 * Phase 1 backfill — legacy roles/assignments → unified model.
 *
 * Populates the new AccessRole + SpaceAssignment tables + User.memberRoleId from
 * the existing OrgRole / SpaceRole / TechnicianAssignment / SpaceMember / User
 * flags. Reads nothing at runtime yet (Phase 2 wires the resolver), so this is
 * purely data migration and is SAFE + IDEMPOTENT (re-runnable): existing rows are
 * never clobbered (`update: {}`), only missing ones are created.
 *
 * Run:  cd apps/api/auth-service && npx tsx prisma/backfill-unified-roles.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
import {
  BUILTIN_ROLES,
  permissionsFromOrgRole,
  permissionsFromSpaceRole,
  type RoleScope,
} from '@hbcfield/shared';

const prisma = new PrismaClient();

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

async function backfillOrg(orgId: string) {
  // 1) Seed built-in roles (idempotent — keep admin edits on re-run).
  const idBySlug = new Map<string, string>();
  for (const preset of BUILTIN_ROLES) {
    const role = await prisma.accessRole.upsert({
      where: { organizationId_slug: { organizationId: orgId, slug: preset.slug } },
      update: {},
      create: {
        organizationId: orgId,
        name: preset.name,
        slug: preset.slug,
        description: preset.description,
        color: preset.color,
        scope: preset.scope as RoleScope,
        isSystem: true,
        legacyKind: null,
        permissions: asJson(preset.permissions),
      },
      select: { id: true },
    });
    idBySlug.set(preset.slug, role.id);
  }

  // 2) OrgRole → AccessRole (ORG). Slug collision with a built-in → merge.
  const orgRoleMap = new Map<string, string>();
  for (const or of await prisma.orgRole.findMany({ where: { organizationId: orgId } })) {
    let newId = idBySlug.get(or.slug);
    if (!newId) {
      const created = await prisma.accessRole.upsert({
        where: { organizationId_slug: { organizationId: orgId, slug: or.slug } },
        update: {},
        create: {
          organizationId: orgId,
          name: or.name,
          slug: or.slug,
          description: or.description,
          color: or.color ?? undefined,
          scope: 'ORG',
          isSystem: or.isSystem,
          legacyKind: 'org',
          position: or.position,
          isActive: or.isActive,
          permissions: asJson(permissionsFromOrgRole(or.permissions)),
        },
        select: { id: true },
      });
      newId = created.id;
    }
    orgRoleMap.set(or.id, newId);
  }

  // 3) SpaceRole → AccessRole (SPACE). Built-in slugs (space-manager/…) merge.
  const spaceRoleMap = new Map<string, string>();
  for (const sr of await prisma.spaceRole.findMany({ where: { organizationId: orgId } })) {
    let newId = idBySlug.get(sr.slug);
    if (!newId) {
      const created = await prisma.accessRole.upsert({
        where: { organizationId_slug: { organizationId: orgId, slug: sr.slug } },
        update: {},
        create: {
          organizationId: orgId,
          name: sr.name,
          slug: sr.slug,
          description: sr.description,
          color: sr.color ?? undefined,
          scope: 'SPACE',
          isSystem: sr.isSystem,
          legacyKind: 'space',
          position: sr.position,
          isActive: sr.isActive,
          permissions: asJson(permissionsFromSpaceRole(sr.permissions)),
        },
        select: { id: true },
      });
      newId = created.id;
    }
    spaceRoleMap.set(sr.id, newId);
  }

  // 4) User.memberRoleId — only where still null (idempotent).
  const users = await prisma.user.findMany({
    where: { organizationId: orgId, memberRoleId: null },
    select: { id: true, role: true, orgRoleId: true, canManageUsers: true, canViewAllTasks: true },
  });
  for (const u of users) {
    let roleId: string | undefined;
    if (u.role === 'ADMIN') roleId = idBySlug.get('admin');
    else if (u.orgRoleId && orgRoleMap.has(u.orgRoleId)) roleId = orgRoleMap.get(u.orgRoleId);
    else if (u.canManageUsers && u.canViewAllTasks) roleId = idBySlug.get('manager');
    if (roleId) await prisma.user.update({ where: { id: u.id }, data: { memberRoleId: roleId } });
  }

  // 5) TechnicianAssignment ∪ SpaceMember → SpaceAssignment (one row per user+space).
  type Merged = {
    userId: string; spaceId: string; roleId?: string;
    isPrimary: boolean; schedule: string[]; effectiveFrom: Date; effectiveTo: Date | null;
    createdById: string | null;
  };
  const merged = new Map<string, Merged>();
  for (const ta of await prisma.technicianAssignment.findMany({ where: { user: { organizationId: orgId } } })) {
    merged.set(`${ta.userId}::${ta.locationId}`, {
      userId: ta.userId, spaceId: ta.locationId,
      isPrimary: ta.isPrimary, schedule: ta.schedule,
      effectiveFrom: ta.effectiveFrom, effectiveTo: ta.effectiveTo, createdById: null,
    });
  }
  for (const sm of await prisma.spaceMember.findMany({ where: { organizationId: orgId } })) {
    const key = `${sm.userId}::${sm.spaceId}`;
    const cur = merged.get(key) ?? {
      userId: sm.userId, spaceId: sm.spaceId,
      isPrimary: false, schedule: [], effectiveFrom: new Date(), effectiveTo: null, createdById: null,
    };
    if (sm.spaceRoleId) cur.roleId = spaceRoleMap.get(sm.spaceRoleId) ?? cur.roleId;
    cur.createdById = sm.createdById ?? cur.createdById;
    merged.set(key, cur);
  }
  for (const m of merged.values()) {
    await prisma.spaceAssignment.upsert({
      where: { userId_spaceId: { userId: m.userId, spaceId: m.spaceId } },
      update: {},
      create: {
        organizationId: orgId,
        userId: m.userId,
        spaceId: m.spaceId,
        roleId: m.roleId,
        isPrimary: m.isPrimary,
        schedule: m.schedule,
        effectiveFrom: m.effectiveFrom,
        effectiveTo: m.effectiveTo,
        createdById: m.createdById,
      },
    });
  }
}

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`Backfilling unified roles for ${orgs.length} org(s)…`);
  for (const org of orgs) {
    await backfillOrg(org.id);
    console.log(`  ✓ ${org.name} (${org.id})`);
  }
  console.log('Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
