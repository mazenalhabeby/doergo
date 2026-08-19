/**
 * Write the per-member permission flags into roles, so the role can become the
 * only source of truth.
 *
 * Today a permission may be granted by the flat columns on the user row OR by
 * the role assigned to them, merged with a union. A union cannot say no, so a
 * role that omits a permission does not withhold it. Making the role
 * authoritative means no longer reading the flags — and doing that without this
 * backfill would silently strip every capability that came only from a flag.
 *
 * So: for each member, if their role already grants everything their flags do,
 * nothing happens. If it does not, they are moved to a role that grants exactly
 * the union of the two. Their effective permissions are unchanged, by
 * construction; what changes is that the role now states them.
 *
 * Roles are shared, so an existing one is never widened — that would hand extra
 * permissions to everyone else holding it. Users needing the same set share a
 * new role, keyed by a signature of the grants, so at most a handful are made.
 *
 *   node prisma/backfill-role-authority.js            # dry run, changes nothing
 *   node prisma/backfill-role-authority.js --apply    # writes
 *
 * Idempotent: a second run reports nothing to do. Plain JS on purpose — the
 * production image has no TypeScript runner.
 */
const { PrismaClient } = require('@prisma/client');

const PERMISSION_KEYS = [
  'canCreateTasks',
  'canViewAllTasks',
  'canAssignTasks',
  'canManageUsers',
  'canViewReports',
  'canApproveOvertime',
  'canManageRota',
  'canReconcileAttendance',
  'canViewSpaceAttendance',
];

const FLAG_KEYS = [
  'canCreateTasks',
  'canViewAllTasks',
  'canAssignTasks',
  'canManageUsers',
  'canViewReports',
];

/** Only the known vocabulary, only explicit true. Mirrors pickPermissions. */
function pick(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of PERMISSION_KEYS) if (raw[k] === true) out[k] = true;
  return out;
}

function flagsOf(user) {
  const out = {};
  for (const k of FLAG_KEYS) if (user[k] === true) out[k] = true;
  return out;
}

function union(a, b) {
  const out = {};
  for (const k of PERMISSION_KEYS) if (a?.[k] === true || b?.[k] === true) out[k] = true;
  return out;
}

function covers(flags, role) {
  for (const k of PERMISSION_KEYS) if (flags?.[k] === true && role?.[k] !== true) return false;
  return true;
}

function signature(perms) {
  const g = PERMISSION_KEYS.filter((k) => perms?.[k] === true).sort();
  return g.length ? g.join('+') : 'none';
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const summary = { scanned: 0, alreadyCovered: 0, needsRole: 0, rolesCreated: 0, reassigned: 0 };
  const created = new Map(); // `${orgId}:${signature}` -> roleId

  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, organizationId: { not: null } },
      select: {
        id: true, email: true, organizationId: true, memberRoleId: true,
        canCreateTasks: true, canViewAllTasks: true, canAssignTasks: true,
        canManageUsers: true, canViewReports: true,
        memberRole: { select: { id: true, name: true, permissions: true, isActive: true } },
      },
    });

    console.log(`${apply ? 'APPLYING' : 'DRY RUN — no writes'}\n`);
    console.log(`Scanning ${users.length} active members…\n`);

    for (const u of users) {
      summary.scanned++;
      const flags = flagsOf(u);
      const rolePerms = u.memberRole?.isActive ? pick(u.memberRole.permissions) : {};

      if (covers(flags, rolePerms)) {
        summary.alreadyCovered++;
        continue;
      }

      summary.needsRole++;
      const target = union(flags, rolePerms);
      const sig = signature(target);
      const missing = PERMISSION_KEYS.filter((k) => flags[k] === true && rolePerms[k] !== true);
      console.log(
        `  ${u.email}\n` +
          `    role now : ${u.memberRole?.name ?? '(none)'} [${signature(rolePerms)}]\n` +
          `    flags add: ${missing.join(', ')}\n` +
          `    target   : ${sig}`,
      );

      const cacheKey = `${u.organizationId}:${sig}`;
      let roleId = created.get(cacheKey);

      if (!roleId) {
        // Reuse an existing role in this org that grants EXACTLY the target —
        // never widen a role other people already hold.
        const candidates = await prisma.accessRole.findMany({
          where: { organizationId: u.organizationId, isActive: true },
          select: { id: true, name: true, permissions: true },
        });
        const exact = candidates.find((r) => signature(pick(r.permissions)) === sig);
        if (exact) {
          roleId = exact.id;
          console.log(`    → existing role "${exact.name}" grants exactly this`);
        } else {
          const baseName = u.memberRole?.name ? `${u.memberRole.name} +` : 'Member +';
          const name = `${baseName} ${missing.join(', ')}`.slice(0, 80);
          const slug = `migrated-${slugify(sig)}`.slice(0, 60);
          console.log(`    → NEW role "${name}" (slug ${slug})`);
          if (apply) {
            const role = await prisma.accessRole.upsert({
              where: { organizationId_slug: { organizationId: u.organizationId, slug } },
              create: {
                organizationId: u.organizationId,
                name,
                slug,
                description: 'Created when per-member permission flags were retired; grants what this member already had.',
                scope: 'ORG',
                permissions: target,
                isActive: true,
              },
              update: {},
            });
            roleId = role.id;
            summary.rolesCreated++;
          } else {
            summary.rolesCreated++;
            roleId = `(dry-run:${sig})`;
          }
        }
        created.set(cacheKey, roleId);
      } else {
        console.log(`    → reusing role created earlier in this run`);
      }

      if (apply) {
        await prisma.user.update({ where: { id: u.id }, data: { memberRoleId: roleId } });
      }
      summary.reassigned++;
      console.log('');
    }

    console.log('\n─── summary ───');
    console.log(`  scanned            ${summary.scanned}`);
    console.log(`  already covered    ${summary.alreadyCovered}   (flags add nothing — nothing to do)`);
    console.log(`  needed a role      ${summary.needsRole}`);
    console.log(`  roles created      ${summary.rolesCreated}`);
    console.log(`  members reassigned ${summary.reassigned}`);
    if (!apply && summary.needsRole > 0) {
      console.log('\n  Re-run with --apply to write these changes.');
    }
    if (summary.needsRole === 0) {
      console.log('\n  Every member\'s role already covers their flags.');
      console.log('  ACCESS_IGNORE_LEGACY_FLAGS=true is safe to set.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
