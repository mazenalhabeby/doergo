/**
 * Move apartments into Assets.
 *
 * A CustomerUnit becomes an Asset of an "Apartments" type in the same space,
 * and everything pointing at the unit is re-pointed at the asset: the tasks
 * raised about it, the logins confined to it, and its notes.
 *
 * Idempotent. Each unit records the asset it became (Asset.details carries a
 * migratedFromUnitId row), so running this twice re-points rather than
 * duplicating.
 *
 * It does NOT delete customer_units. The table stays until the migration has
 * been lived with — dropping it in the same step would make a mis-mapping
 * unrecoverable, and it costs nothing to keep.
 *
 *   npx tsx prisma/migrate-units-to-assets.ts          # report only
 *   npx tsx prisma/migrate-units-to-assets.ts --apply  # do it
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

/** The shape an apartment record needs — the Apartment template, inlined. */
const APARTMENT_SHAPE = {
  nameLabel: 'Flat',
  hasAddress: true,
  holder: { enabled: true, label: 'Resident', members: true, clients: true },
  fields: [{ label: 'Floor' }, { label: 'Rooms' }, { label: 'Size' }, { label: 'Door code' }],
  allowExtraFields: true,
  money: {
    enabled: true,
    categories: [
      { label: 'Rent', direction: 'in' },
      { label: 'Repairs', direction: 'out' },
      { label: 'Utilities', direction: 'out' },
    ],
  },
  lists: [],
};

const MARKER = 'migratedFromUnitId';

async function main() {
  const units = await prisma.customerUnit.findMany({
    orderBy: { createdAt: 'asc' },
  });
  console.log(`${units.length} apartment(s) to move${APPLY ? '' : ' — dry run, nothing written'}`);
  if (!units.length) return;

  // One "Apartments" type per space that has units. A unit with no space lands
  // on an org-level type, which is where org-level assets already live.
  const typeFor = new Map<string, string>();
  const key = (orgId: string, spaceId: string | null) => `${orgId}:${spaceId ?? ''}`;

  for (const unit of units) {
    const k = key(unit.organizationId, unit.spaceId);
    if (typeFor.has(k)) continue;

    const existing = await prisma.assetCategory.findFirst({
      where: { organizationId: unit.organizationId, spaceId: unit.spaceId, name: 'Apartments' },
      select: { id: true },
    });
    if (existing) {
      typeFor.set(k, existing.id);
      continue;
    }
    if (!APPLY) {
      typeFor.set(k, `(new type for space ${unit.spaceId ?? 'org'})`);
      continue;
    }
    const made = await prisma.assetCategory.create({
      data: {
        organizationId: unit.organizationId,
        spaceId: unit.spaceId,
        name: 'Apartments',
        description: 'Moved from the Apartments module',
        config: APARTMENT_SHAPE as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    typeFor.set(k, made.id);
  }

  let created = 0;
  let reused = 0;
  let tasksMoved = 0;
  let loginsMoved = 0;
  let notesMoved = 0;

  for (const unit of units) {
    const categoryId = typeFor.get(key(unit.organizationId, unit.spaceId))!;

    // Already moved? The marker on the asset says so.
    const already = await prisma.asset.findFirst({
      where: {
        organizationId: unit.organizationId,
        categoryId: APPLY ? categoryId : undefined,
        details: { array_contains: [{ label: MARKER, value: unit.id }] } as Prisma.JsonFilter,
      },
      select: { id: true },
    });

    const details = [
      ...(Array.isArray(unit.details) ? (unit.details as { label: string; value: string }[]) : []),
      { label: MARKER, value: unit.id },
    ];

    let assetId = already?.id ?? null;
    if (already) {
      reused++;
    } else if (APPLY) {
      const made = await prisma.asset.create({
        data: {
          organizationId: unit.organizationId,
          categoryId,
          name: unit.name,
          locationAddress: unit.address,
          locationLat: unit.lat,
          locationLng: unit.lng,
          // A unit is held by EITHER its resident member or its client, exactly
          // as an asset is — the rule carries over unchanged.
          holderUserId: unit.residentUserId,
          customerId: unit.residentUserId ? null : unit.customerId,
          details: details as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      assetId = made.id;
      created++;
    } else {
      created++;
    }

    if (!APPLY || !assetId) continue;

    // Re-point everything that referred to the unit.
    const t = await prisma.task.updateMany({
      where: { unitId: unit.id, assetId: null },
      data: { assetId },
    });
    tasksMoved += t.count;

    const u = await prisma.user.updateMany({
      where: { unitId: unit.id, assetId: null },
      data: { assetId },
    });
    loginsMoved += u.count;

    // Notes become the asset's activity, keeping author and time.
    const notes = await prisma.unitActivity.findMany({ where: { unitId: unit.id } });
    for (const n of notes) {
      const dup = await prisma.assetActivity.findFirst({
        where: { assetId, createdAt: n.createdAt, body: n.body ?? undefined },
        select: { id: true },
      });
      if (dup) continue;
      await prisma.assetActivity.create({
        data: {
          organizationId: n.organizationId,
          assetId,
          type: n.type === 'NOTE' ? 'NOTE' : 'SYSTEM',
          body: n.body,
          authorId: n.authorId,
          createdAt: n.createdAt,
        },
      });
      notesMoved++;
    }
  }

  console.log({ created, reused, tasksMoved, loginsMoved, notesMoved });
  if (!APPLY) console.log('\nRe-run with --apply to write it.');
  else console.log('\ncustomer_units is untouched — nothing here is unrecoverable.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
