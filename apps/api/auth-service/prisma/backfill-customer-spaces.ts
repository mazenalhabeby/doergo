/**
 * One-off backfill: migrate B2B customers (Customer.isPortalResident = false) into
 * Customer-company Spaces (CompanyLocation.kind = CUSTOMER), and attach their
 * UNASSIGNED tasks to the new space.
 *
 * Safety:
 *  - Idempotent BY SOURCE ID: each customer-space records `sourceCustomerId`, so a
 *    re-run reuses the exact space (never duplicates, never merges two customers
 *    that happen to share a name). A legacy space created before this column existed
 *    is adopted by (organizationId, name) once and stamped with sourceCustomerId.
 *  - Non-destructive: only sets Task.spaceId when the task has NO real space yet
 *    (null, or the org's default "unassigned" bucket). Tasks already on a real
 *    work-area board are LEFT IN PLACE — no prior spaceId is ever overwritten.
 *    Task.customerId is retained, so the customer link survives regardless.
 *  - Atomic per customer: the space create/adopt + task attach run in one
 *    transaction, so a crash never leaves a space without its tasks (or vice-versa).
 *  - Org-scoped: every write is constrained by organizationId.
 *  - Portal residents (isPortalResident=true), CustomerUnit, and portal tasks are
 *    NOT touched. O(#customers): existing spaces + org defaults preloaded once.
 *
 * Run once, after the additive migration is applied:
 *   cd apps/api/auth-service && npx tsx prisma/backfill-customer-spaces.ts
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ORG_MODULES } from '@hbcfield/shared';

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

  // Preload once → O(n), not O(n²).
  const existingSpaces = await prisma.companyLocation.findMany({
    where: { kind: 'CUSTOMER' },
    select: { id: true, organizationId: true, name: true, sourceCustomerId: true },
  });
  const bySourceId = new Map(
    existingSpaces.filter((s) => s.sourceCustomerId).map((s) => [s.sourceCustomerId as string, s.id]),
  );
  const legacyByName = new Map(
    existingSpaces.filter((s) => !s.sourceCustomerId).map((s) => [`${s.organizationId}::${s.name}`, s.id]),
  );

  const defaults = await prisma.companyLocation.findMany({
    where: { isDefault: true },
    select: { id: true, organizationId: true },
  });
  const defaultByOrg = new Map(defaults.map((d) => [d.organizationId, d.id]));

  let spacesCreated = 0;
  let spacesAdopted = 0;
  let spacesReused = 0;
  let tasksAttached = 0;

  for (const c of customers) {
    const def = defaultByOrg.get(c.organizationId);
    const movableTaskWhere = {
      customerId: c.id,
      organizationId: c.organizationId,
      OR: [{ spaceId: null }, ...(def ? [{ spaceId: def }] : [])],
    };

    // Everything for one customer in a single transaction (atomic).
    const outcome = await prisma.$transaction(async (tx) => {
      let spaceId = bySourceId.get(c.id);
      let mode: 'created' | 'adopted' | 'reused' = 'reused';

      if (!spaceId) {
        const legacy = legacyByName.get(`${c.organizationId}::${c.name}`);
        if (legacy) {
          // Adopt a space made before sourceCustomerId existed; stamp it so future
          // runs match by id.
          await tx.companyLocation.update({ where: { id: legacy }, data: { sourceCustomerId: c.id } });
          spaceId = legacy;
          legacyByName.delete(`${c.organizationId}::${c.name}`); // don't let two customers adopt the same legacy space
          mode = 'adopted';
        } else {
          const created = await tx.companyLocation.create({
            data: {
              organizationId: c.organizationId,
              name: c.name,
              kind: 'CUSTOMER',
              address: c.address ?? null,
              contactName: c.contactName ?? null,
              contactEmail: c.email ?? null,
              contactPhone: c.phone ?? null,
              sourceCustomerId: c.id,
              // Match the create-service defaults (module set) instead of null.
              enabledModules: DEFAULT_ORG_MODULES as unknown as any,
            },
            select: { id: true },
          });
          spaceId = created.id;
          mode = 'created';
        }
        bySourceId.set(c.id, spaceId);
      }

      const res = await tx.task.updateMany({ where: movableTaskWhere, data: { spaceId } });
      return { mode, attached: res.count };
    });

    if (outcome.mode === 'created') spacesCreated++;
    else if (outcome.mode === 'adopted') spacesAdopted++;
    else spacesReused++;
    tasksAttached += outcome.attached;
  }

  console.log(
    `[backfill] done — spaces: ${spacesCreated} created, ${spacesAdopted} adopted, ${spacesReused} reused; ` +
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
