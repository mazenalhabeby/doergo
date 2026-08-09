/**
 * One-off backfill: migrate B2B customers (Customer.isPortalResident = false) into
 * Customer-company Spaces (CompanyLocation.kind = CUSTOMER), and attach their
 * UNASSIGNED tasks to the new space.
 *
 * Safety (post-audit):
 *  - Non-destructive: only sets Task.spaceId when the task has NO real space yet
 *    (spaceId is null, or the org's default "unassigned" bucket). Tasks already on
 *    a real work-area board are LEFT IN PLACE — no prior spaceId is ever
 *    overwritten/lost. Task.customerId is retained, so the customer link survives
 *    regardless (fully re-homing already-boarded tasks needs the cross-cutting
 *    space model — a documented follow-up).
 *  - Org-scoped: every write is constrained by organizationId (belt-and-suspenders
 *    on top of the globally-unique customerId).
 *  - Idempotent: reuses an existing CUSTOMER space with the same (organizationId,
 *    name); re-runs are safe.
 *  - Portal residents (isPortalResident=true), CustomerUnit, and portal tasks are
 *    NOT touched.
 *  - O(#customers): existing customer spaces + org defaults are preloaded once (no
 *    per-customer findFirst).
 *
 * Run once, after the additive migration is applied:
 *   cd apps/api/auth-service && npx tsx prisma/backfill-customer-spaces.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany({
    where: { isPortalResident: false },
    select: {
      id: true,
      organizationId: true,
      name: true,
      address: true,
      contactName: true,
      email: true,
      phone: true,
    },
  });
  console.log(`[backfill] ${customers.length} B2B customers (isPortalResident=false) to migrate`);

  // Preload once (avoids a per-customer findFirst → O(n) not O(n²)).
  const existingSpaces = await prisma.companyLocation.findMany({
    where: { kind: 'CUSTOMER' },
    select: { id: true, organizationId: true, name: true },
  });
  const spaceByKey = new Map(existingSpaces.map((s) => [`${s.organizationId}::${s.name}`, s.id]));

  const defaults = await prisma.companyLocation.findMany({
    where: { isDefault: true },
    select: { id: true, organizationId: true },
  });
  const defaultByOrg = new Map(defaults.map((d) => [d.organizationId, d.id]));

  let spacesCreated = 0;
  let spacesReused = 0;
  let tasksAttached = 0;

  for (const c of customers) {
    const key = `${c.organizationId}::${c.name}`;
    let spaceId = spaceByKey.get(key);
    if (!spaceId) {
      const created = await prisma.companyLocation.create({
        data: {
          organizationId: c.organizationId,
          name: c.name,
          kind: 'CUSTOMER',
          address: c.address ?? null,
          contactName: c.contactName ?? null,
          contactEmail: c.email ?? null,
          contactPhone: c.phone ?? null,
        },
        select: { id: true },
      });
      spaceId = created.id;
      spaceByKey.set(key, spaceId);
      spacesCreated++;
    } else {
      spacesReused++;
    }

    // Attach only UNASSIGNED tasks (null spaceId, or the org's default bucket) —
    // never overwrite a real work-area assignment. Org-scoped for safety.
    const def = defaultByOrg.get(c.organizationId);
    const res = await prisma.task.updateMany({
      where: {
        customerId: c.id,
        organizationId: c.organizationId,
        OR: [{ spaceId: null }, ...(def ? [{ spaceId: def }] : [])],
      },
      data: { spaceId },
    });
    tasksAttached += res.count;
  }

  console.log(
    `[backfill] done — spaces: ${spacesCreated} created, ${spacesReused} reused; ` +
      `${tasksAttached} unassigned tasks attached to their customer space. ` +
      `Tasks already on a work board were left in place (customerId retained). Portal residents untouched.`,
  );
}

main()
  .catch((e) => {
    console.error('[backfill] FAILED', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
