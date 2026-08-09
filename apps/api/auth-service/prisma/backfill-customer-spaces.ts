/**
 * One-off backfill: migrate B2B customers (Customer.isPortalResident = false) into
 * Customer-company Spaces (CompanyLocation.kind = CUSTOMER), and re-point their
 * tasks (Task.customerId -> the new space's spaceId).
 *
 * Idempotent + org-scoped:
 *  - Reuses an existing CUSTOMER space with the same (organizationId, name) instead
 *    of creating a duplicate, so re-running is safe.
 *  - Leaves Task.customerId intact (nothing dropped) so the migration is reversible.
 *  - Portal residents (isPortalResident = true), CustomerUnit, and portal tasks are
 *    NOT touched.
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

  let spacesCreated = 0;
  let spacesReused = 0;
  let tasksRepointed = 0;
  let tasksWithPriorSpace = 0;

  for (const c of customers) {
    // Idempotency: reuse an existing CUSTOMER space with the same org + name.
    let space = await prisma.companyLocation.findFirst({
      where: { organizationId: c.organizationId, kind: 'CUSTOMER', name: c.name },
      select: { id: true },
    });
    if (!space) {
      space = await prisma.companyLocation.create({
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
      spacesCreated++;
    } else {
      spacesReused++;
    }

    // Transparency: how many of this customer's tasks already sit in a different space
    // (customer wins as the job's home space, per plan; customerId is kept for revert).
    tasksWithPriorSpace += await prisma.task.count({
      where: { customerId: c.id, spaceId: { not: null, notIn: [space.id] } },
    });

    const res = await prisma.task.updateMany({
      where: { customerId: c.id },
      data: { spaceId: space.id },
    });
    tasksRepointed += res.count;
  }

  console.log(
    `[backfill] done — spaces: ${spacesCreated} created, ${spacesReused} reused; ` +
      `tasks re-pointed: ${tasksRepointed} (of which ${tasksWithPriorSpace} had a different prior space, now overwritten). ` +
      `Task.customerId left intact for reversibility. Portal residents untouched.`,
  );
}

main()
  .catch((e) => {
    console.error('[backfill] FAILED', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
