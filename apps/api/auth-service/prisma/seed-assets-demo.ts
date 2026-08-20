/**
 * Demo data for Assets — enough of it to exercise every part.
 *
 * Creates three kinds that between them use every option a kind has, a shared
 * parts catalogue and fault-code library typed once, a machine broken down into
 * subunits and components, holders, money with months of history, and notes.
 *
 * Repeatable: it removes only the kinds it created (by name, in the chosen
 * space) and rebuilds them, so running it twice does not double anything and
 * never touches kinds somebody made by hand.
 *
 *   npx tsx prisma/seed-assets-demo.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const KINDS = ['Machines', 'Rental flats', 'Service vans'] as const;

/** Months back from today, so the money history spans a real period. */
const monthsAgo = (n: number, day = 4) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n, day);
  d.setHours(9, 0, 0, 0);
  return d;
};

async function main() {
  // ── Where does this go? ────────────────────────────────────────────────
  // The space that has the assets module switched on, else the first space of
  // the first organization — so the script works on a fresh database too.
  const spaces = await prisma.companyLocation.findMany({
    select: { id: true, name: true, organizationId: true, enabledModules: true },
    orderBy: { createdAt: 'asc' },
  });
  const withAssets = spaces.find((s) => JSON.stringify(s.enabledModules ?? []).includes('assets'));
  const space = withAssets ?? spaces[0];
  if (!space) throw new Error('No space to attach the demo to — create one first.');

  const orgId = space.organizationId;
  console.log(`→ ${space.name} (${withAssets ? 'assets module on' : 'assets module OFF — switch it on to see the tab'})`);

  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: 'ADMIN' },
    select: { id: true, firstName: true, lastName: true },
  });
  const members = await prisma.user.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, firstName: true, lastName: true },
    take: 6,
  });
  const client = await prisma.customer.findFirst({
    where: { organizationId: orgId },
    select: { id: true, name: true },
  });
  const author = admin?.id ?? members[0]?.id ?? null;

  // ── Start clean ────────────────────────────────────────────────────────
  // Cascades take the assets, their rows, money and activity with them.
  const old = await prisma.assetCategory.findMany({
    where: { organizationId: orgId, spaceId: space.id, name: { in: [...KINDS] } },
    select: { id: true },
  });
  if (old.length) {
    await prisma.assetCategory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    console.log(`  cleared ${old.length} previous demo kind(s)`);
  }

  // ── 1. Machines ────────────────────────────────────────────────────────
  const machines = await prisma.assetCategory.create({
    data: {
      organizationId: orgId,
      spaceId: space.id,
      name: 'Machines',
      description: 'Production machines, broken down into their parts',
      config: {
        nameLabel: 'Machine name',
        hasAddress: false,
        holder: { enabled: true, label: 'Operator', members: true, clients: false },
        fields: [{ label: 'Maker' }, { label: 'Model' }, { label: 'Installed' }, { label: 'Serial' }],
        allowExtraFields: true,
        money: {
          enabled: true,
          categories: [
            { label: 'Repairs', direction: 'out' },
            { label: 'Service', direction: 'out' },
            { label: 'Spare parts', direction: 'out' },
          ],
        },
        lists: [
          {
            label: 'Parts', role: 'parts', shared: true,
            columns: [{ label: 'Code' }, { label: 'Name' }, { label: 'Qty' }, { label: 'Supplier' }],
          },
          {
            label: 'Fault codes', role: 'faults', shared: true,
            columns: [{ label: 'Code' }, { label: 'Meaning' }, { label: 'Cause' }, { label: 'Fix' }, { label: 'Part' }, { label: 'Safety' }],
          },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // Shared catalogue — typed once, read by every machine of this kind.
  const parts: [string, string, string, string][] = [
    ['HYD-8842', 'Hydraulic seal kit', '2', 'Bosch Rexroth'],
    ['BLT-0191', 'Drive belt', '1', 'Optibelt'],
    ['FLT-3320', 'Oil filter', '4', 'Mann+Hummel'],
    ['BRG-7741', 'Main bearing', '1', 'SKF'],
    ['SNS-2210', 'Pressure sensor', '2', 'IFM'],
    ['VLV-5502', 'Solenoid valve', '1', 'Festo'],
    ['MTR-9001', 'Drive motor 7.5 kW', '1', 'Siemens'],
    ['GBX-4400', 'Gearbox oil 5 L', '2', 'Shell'],
  ];
  await prisma.assetListRow.createMany({
    data: parts.map(([Code, Name, Qty, Supplier], i) => ({
      organizationId: orgId, categoryId: machines.id, list: 'Parts', position: i + 1,
      values: { Code, Name, Qty, Supplier } as unknown as Prisma.InputJsonValue,
    })),
  });

  const faults: [string, string, string, string, string, string][] = [
    ['E-204', 'Low oil pressure', 'Seal worn or oil level low', 'Top up, then replace the seal kit', 'HYD-8842', 'Depressurise the circuit first'],
    ['E-211', 'Hydraulic overheating', 'Blocked filter', 'Replace the oil filter', 'FLT-3320', 'Surfaces stay hot for 30 min'],
    ['E-330', 'Drive slipping', 'Belt stretched', 'Fit a new drive belt and re-tension', 'BLT-0191', 'Isolate before opening the guard'],
    ['E-402', 'Bearing noise', 'Bearing at end of life', 'Replace the main bearing', 'BRG-7741', 'Two-person lift'],
    ['E-515', 'No pressure reading', 'Sensor failed or cable pinched', 'Check the cable, then swap the sensor', 'SNS-2210', ''],
    ['E-620', 'Valve does not switch', 'Coil burnt out', 'Replace the solenoid valve', 'VLV-5502', 'Live terminals — lock off'],
  ];
  await prisma.assetListRow.createMany({
    data: faults.map(([Code, Meaning, Cause, Fix, Part, Safety], i) => ({
      organizationId: orgId, categoryId: machines.id, list: 'Fault codes', position: i + 1,
      values: { Code, Meaning, Cause, Fix, Part, Safety } as unknown as Prisma.InputJsonValue,
    })),
  });

  // A machine, and what it is made of (ISO 14224: unit → subunit → component).
  const press4 = await prisma.asset.create({
    data: {
      organizationId: orgId, categoryId: machines.id, name: 'Press 4',
      serialNumber: 'PR4-2019-8823', holderUserId: members[0]?.id ?? null,
      details: [
        { label: 'Maker', value: 'Schuler' },
        { label: 'Model', value: 'MSD-250' },
        { label: 'Installed', value: 'March 2019' },
        { label: 'Serial', value: 'PR4-2019-8823' },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  const child = (name: string, parentId: string, serial?: string, extra?: Record<string, string>) =>
    prisma.asset.create({
      data: {
        organizationId: orgId, categoryId: machines.id, name, parentId, serialNumber: serial ?? null,
        details: Object.entries(extra ?? {}).map(([label, value]) => ({ label, value })) as unknown as Prisma.InputJsonValue,
      },
    });

  const hydraulics = await child('Hydraulic unit', press4.id, 'HU-441');
  await child('Pump', hydraulics.id, 'P-88231', { Maker: 'Bosch Rexroth', Model: 'A10VSO' });
  await child('Valve block', hydraulics.id, 'VB-2210');
  const drive = await child('Drive', press4.id, 'DR-119');
  await child('Motor', drive.id, 'M-7745', { Maker: 'Siemens', Model: '1LE1' });
  await child('Gearbox', drive.id, 'G-3390', { Maker: 'SEW', Model: 'K87' });
  await child('Control cabinet', press4.id, 'CC-556');

  // A second machine, to prove the catalogue is shared rather than retyped.
  const press5 = await prisma.asset.create({
    data: {
      organizationId: orgId, categoryId: machines.id, name: 'Press 5',
      serialNumber: 'PR5-2021-1044', holderUserId: members[1]?.id ?? null,
      details: [
        { label: 'Maker', value: 'Schuler' },
        { label: 'Model', value: 'MSD-250' },
        { label: 'Installed', value: 'July 2021' },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  // What happened to Press 4 — the history a technician reads before starting.
  await prisma.assetActivity.createMany({
    data: [
      { organizationId: orgId, assetId: press4.id, type: 'NOTE', authorId: author, body: 'E-204 raised. Oil at minimum, seal weeping. Topped up and replaced HYD-8842.', createdAt: monthsAgo(5) },
      { organizationId: orgId, assetId: press4.id, type: 'NOTE', authorId: author, body: 'Annual service. Filter and gearbox oil changed.', createdAt: monthsAgo(3) },
      { organizationId: orgId, assetId: press4.id, type: 'HOLDER_CHANGED', authorId: author, createdAt: monthsAgo(2), metadata: { from: { holderUserId: null }, to: { holderUserId: members[0]?.id ?? null } } as unknown as Prisma.InputJsonValue },
      { organizationId: orgId, assetId: press4.id, type: 'NOTE', authorId: author, body: 'E-204 again — second time in five months. Seal fine; suspect the pump. Watch it.', createdAt: monthsAgo(0, 12) },
    ],
  });

  await prisma.assetMoney.createMany({
    data: [
      { organizationId: orgId, assetId: press4.id, category: 'Repairs', direction: 'OUT', amountCents: 34000, note: 'Seal kit + labour', occurredAt: monthsAgo(5), authorId: author },
      { organizationId: orgId, assetId: press4.id, category: 'Service', direction: 'OUT', amountCents: 78000, note: 'Annual service', occurredAt: monthsAgo(3), authorId: author },
      { organizationId: orgId, assetId: press4.id, category: 'Spare parts', direction: 'OUT', amountCents: 12500, note: 'Oil filter x4', occurredAt: monthsAgo(3), authorId: author },
      { organizationId: orgId, assetId: press4.id, category: 'Repairs', direction: 'OUT', amountCents: 34000, note: 'Seal kit again', occurredAt: monthsAgo(0, 12), authorId: author },
    ],
  });

  // ── 2. Rental flats ────────────────────────────────────────────────────
  const flats = await prisma.assetCategory.create({
    data: {
      organizationId: orgId, spaceId: space.id, name: 'Rental flats',
      description: 'The flats we rent out',
      config: {
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
        lists: [
          { label: 'Keys', role: 'plain', shared: false, columns: [{ label: 'Key' }, { label: 'Held by' }] },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const flat3b = await prisma.asset.create({
    data: {
      organizationId: orgId, categoryId: flats.id, name: 'Flat 3B',
      locationAddress: 'Hauptstraße 12, 4020 Linz', locationLat: 48.3069, locationLng: 14.2858,
      holderUserId: members[2]?.id ?? null,
      details: [
        { label: 'Floor', value: '3' }, { label: 'Rooms', value: '2' },
        { label: 'Size', value: '58 m²' }, { label: 'Door code', value: '4417' },
      ] as unknown as Prisma.InputJsonValue,
    },
  });
  const flat4a = await prisma.asset.create({
    data: {
      organizationId: orgId, categoryId: flats.id, name: 'Flat 4A',
      locationAddress: 'Hauptstraße 12, 4020 Linz', locationLat: 48.3071, locationLng: 14.2861,
      customerId: client?.id ?? null,
      details: [
        { label: 'Floor', value: '4' }, { label: 'Rooms', value: '3' }, { label: 'Size', value: '76 m²' },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  // Keys are per-record: these belong to this flat, not to every flat.
  await prisma.assetListRow.createMany({
    data: [
      { organizationId: orgId, assetId: flat3b.id, list: 'Keys', position: 1, values: { Key: 'Front door', 'Held by': 'Resident' } as unknown as Prisma.InputJsonValue },
      { organizationId: orgId, assetId: flat3b.id, list: 'Keys', position: 2, values: { Key: 'Cellar', 'Held by': 'Caretaker' } as unknown as Prisma.InputJsonValue },
      { organizationId: orgId, assetId: flat4a.id, list: 'Keys', position: 1, values: { Key: 'Front door', 'Held by': 'Client' } as unknown as Prisma.InputJsonValue },
    ],
  });

  // Six months of rent, and what came out of it.
  const rent: Prisma.AssetMoneyCreateManyInput[] = [];
  for (let m = 5; m >= 0; m--) {
    rent.push({ organizationId: orgId, assetId: flat3b.id, category: 'Rent', direction: 'IN', amountCents: 90000, note: 'Monthly rent', occurredAt: monthsAgo(m, 1), authorId: author });
    rent.push({ organizationId: orgId, assetId: flat4a.id, category: 'Rent', direction: 'IN', amountCents: 118000, note: 'Monthly rent', occurredAt: monthsAgo(m, 1), authorId: author });
    rent.push({ organizationId: orgId, assetId: flat3b.id, category: 'Utilities', direction: 'OUT', amountCents: 12000, note: 'Heating & water', occurredAt: monthsAgo(m, 8), authorId: author });
  }
  rent.push({ organizationId: orgId, assetId: flat3b.id, category: 'Repairs', direction: 'OUT', amountCents: 8500, note: 'Kitchen tap', occurredAt: monthsAgo(2, 14), authorId: author });
  await prisma.assetMoney.createMany({ data: rent });

  await prisma.assetActivity.createMany({
    data: [
      { organizationId: orgId, assetId: flat3b.id, type: 'NOTE', authorId: author, body: 'Tap in the kitchen replaced. Tenant happy.', createdAt: monthsAgo(2, 14) },
      { organizationId: orgId, assetId: flat3b.id, type: 'NOTE', authorId: author, body: 'Smoke alarm tested — fine.', createdAt: monthsAgo(1, 9) },
    ],
  });

  // ── 3. Service vans ────────────────────────────────────────────────────
  const vans = await prisma.assetCategory.create({
    data: {
      organizationId: orgId, spaceId: space.id, name: 'Service vans',
      description: 'The vans the field team drives',
      config: {
        nameLabel: 'Plate',
        hasAddress: false,
        holder: { enabled: true, label: 'Driver', members: true, clients: false },
        fields: [{ label: 'Make' }, { label: 'Model' }, { label: 'Year' }, { label: 'Next test' }],
        allowExtraFields: false,
        money: {
          enabled: true,
          categories: [
            { label: 'Fuel', direction: 'out' },
            { label: 'Service', direction: 'out' },
            { label: 'Insurance', direction: 'out' },
          ],
        },
        lists: [
          { label: 'Parts', role: 'parts', shared: true, columns: [{ label: 'Code' }, { label: 'Name' }, { label: 'Qty' }] },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.assetListRow.createMany({
    data: [
      { organizationId: orgId, categoryId: vans.id, list: 'Parts', position: 1, values: { Code: 'OIL-5W30', Name: 'Engine oil 5W-30', Qty: '5' } as unknown as Prisma.InputJsonValue },
      { organizationId: orgId, categoryId: vans.id, list: 'Parts', position: 2, values: { Code: 'WIP-F24', Name: 'Wiper blades', Qty: '2' } as unknown as Prisma.InputJsonValue },
      { organizationId: orgId, categoryId: vans.id, list: 'Parts', position: 3, values: { Code: 'BRK-P118', Name: 'Brake pads front', Qty: '1' } as unknown as Prisma.InputJsonValue },
    ],
  });

  const van = await prisma.asset.create({
    data: {
      organizationId: orgId, categoryId: vans.id, name: 'W-2208-HB',
      serialNumber: 'WV1ZZZ2KZ8X012208', holderUserId: members[3]?.id ?? members[0]?.id ?? null,
      details: [
        { label: 'Make', value: 'VW' }, { label: 'Model', value: 'Caddy Maxi' },
        { label: 'Year', value: '2022' }, { label: 'Next test', value: 'Feb 2027' },
      ] as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.assetMoney.createMany({
    data: [
      { organizationId: orgId, assetId: van.id, category: 'Fuel', direction: 'OUT', amountCents: 7120, note: 'Diesel', occurredAt: monthsAgo(0, 3), authorId: author },
      { organizationId: orgId, assetId: van.id, category: 'Fuel', direction: 'OUT', amountCents: 6890, note: 'Diesel', occurredAt: monthsAgo(1, 6), authorId: author },
      { organizationId: orgId, assetId: van.id, category: 'Service', direction: 'OUT', amountCents: 34000, note: '60,000 km service', occurredAt: monthsAgo(2, 2), authorId: author },
      { organizationId: orgId, assetId: van.id, category: 'Insurance', direction: 'OUT', amountCents: 62000, note: 'Annual premium', occurredAt: monthsAgo(4, 1), authorId: author },
    ],
  });
  await prisma.assetActivity.create({
    data: { organizationId: orgId, assetId: van.id, type: 'NOTE', authorId: author, body: 'Scratch on the near-side door — photographed, not repairing yet.', createdAt: monthsAgo(1, 20) },
  });

  // ── What went in ───────────────────────────────────────────────────────
  const counts = {
    kinds: await prisma.assetCategory.count({ where: { spaceId: space.id, name: { in: [...KINDS] } } }),
    records: await prisma.asset.count({ where: { categoryId: { in: [machines.id, flats.id, vans.id] } } }),
    sharedRows: await prisma.assetListRow.count({ where: { categoryId: { in: [machines.id, vans.id] } } }),
    recordRows: await prisma.assetListRow.count({ where: { assetId: { in: [flat3b.id, flat4a.id] } } }),
    money: await prisma.assetMoney.count({ where: { assetId: { in: [press4.id, press5.id, flat3b.id, flat4a.id, van.id] } } }),
    notes: await prisma.assetActivity.count({ where: { assetId: { in: [press4.id, flat3b.id, van.id] } } }),
  };
  console.log('  ', counts);
  console.log(`   Press 4 has 6 parts beneath it; Press 5 shares the same catalogue.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
