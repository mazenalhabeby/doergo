import { PrismaClient } from '@prisma/client';

/*
  Invoices spanning every ageing band, so the receivables screen can actually be
  looked at. An empty table renders a page that is technically correct and shows
  nothing — every bar at zero, every colour unused.

  Dates are relative to today, so this stays meaningful whenever it is re-run
  rather than drifting into "everything is 400 days overdue".
*/
const prisma = new PrismaClient();

const day = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * day);
const ahead = (d: number) => new Date(Date.now() + d * day);

const CLIENTS = [
  ['Fischer Immobilien GmbH', 'buchhaltung@fischer-immo.at', 'Landstraße 12, 4020 Linz'],
  ['Bäckerei Hofer', 'office@hofer-baeckerei.at', 'Hauptplatz 3, 4810 Gmunden'],
  ['Stadtwerke Vöcklabruck', 'ap@stadtwerke-vb.at', 'Werkstraße 8, 4840 Vöcklabruck'],
  ['Hotel Seeblick', 'finanz@hotel-seeblick.at', 'Seepromenade 44, 4802 Ebensee'],
  ['Autohaus Gruber', 'rechnung@gruber-auto.at', 'Industriezeile 90, 4020 Linz'],
  ['Praxis Dr. Wimmer', 'praxis@dr-wimmer.at', 'Ringstraße 5, 4600 Wels'],
];

/** [status, issued days ago, due days ago (negative = future), total] */
const PLAN: Array<[string, number, number, number]> = [
  // Not yet due — the healthy part of the ledger.
  ['SENT', 5, -25, 1_240.0],
  ['SENT', 12, -18, 480.5],
  ['SENT', 2, -28, 3_150.0],
  // 1–30 days late: a reminder.
  ['SENT', 40, 10, 890.0],
  ['OVERDUE', 52, 22, 2_400.0],
  // 31–60: a second reminder, and someone should be asking why.
  ['OVERDUE', 75, 45, 1_680.0],
  ['OVERDUE', 88, 58, 320.0],
  // 61–90: a phone call.
  ['OVERDUE', 105, 75, 4_900.0],
  // 90+: the one that decides the day.
  ['OVERDUE', 160, 130, 7_450.0],
  ['OVERDUE', 220, 190, 1_100.0],
  // Settled — must NOT appear in the ageing figures.
  ['PAID', 90, 60, 2_200.0],
  ['PAID', 45, 15, 960.0],
  ['PAID', 20, -10, 5_300.0],
  // Neither owed nor settled.
  ['DRAFT', 3, -27, 740.0],
  ['DRAFT', 1, -29, 1_890.0],
  ['CANCELED', 70, 40, 1_500.0],
];

const ITEMS: Array<[string, number, number]> = [
  ['Heizungswartung — Jahresvertrag', 1, 0],
  ['Störungsbehebung, Anfahrt inklusive', 2, 0],
  ['Ersatzteile laut Serviceprotokoll', 1, 0],
  ['Elektroinstallation, Arbeitsstunden', 8, 0],
];

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: 'Acme Corporation' },
    select: { id: true },
  });
  if (!org) throw new Error('No "Acme Corporation" organization — run the demo seed first.');

  const creator = await prisma.user.findFirst({
    where: { organizationId: org.id, role: 'ADMIN' },
    select: { id: true },
  });
  if (!creator) throw new Error('No admin in that organization to own the invoices.');

  // Re-runnable: clear only what this script created, never anyone's real data.
  const existing = await prisma.invoice.findMany({
    where: { organizationId: org.id, invoiceNumber: { startsWith: 'INV-DEMO-' } },
    select: { id: true },
  });
  if (existing.length) {
    await prisma.invoice.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } });
    console.log(`Removed ${existing.length} previous demo invoices`);
  }

  const year = new Date().getFullYear();
  let n = 0;

  for (const [status, issuedAgo, dueAgo, total] of PLAN) {
    n++;
    const subtotal = Math.round((total / 1.2) * 100) / 100; // Austrian VAT 20%
    const taxAmount = Math.round((total - subtotal) * 100) / 100;
    const [name, email, address] = CLIENTS[n % CLIENTS.length]!;
    const [desc, qty] = ITEMS[n % ITEMS.length]!;

    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-DEMO-${year}-${String(n).padStart(4, '0')}`,
        status: status as any,
        clientName: name,
        clientEmail: email,
        clientAddress: address,
        subtotal,
        taxRate: 0.2,
        taxAmount,
        discount: 0,
        total,
        currency: 'EUR',
        issueDate: ago(issuedAgo),
        dueDate: dueAgo >= 0 ? ago(dueAgo) : ahead(-dueAgo),
        // Only a PAID invoice has a payment date — leaving one on an unpaid row
        // is how a screen ends up claiming money it has not received.
        paidAt: status === 'PAID' ? ago(Math.max(0, dueAgo - 3)) : null,
        organizationId: org.id,
        createdById: creator.id,
        items: {
          create: [{
            description: desc as string,
            quantity: qty as number,
            unitPrice: Math.round((subtotal / (qty as number)) * 100) / 100,
            amount: subtotal,
          }],
        },
      },
    });
  }

  const byStatus = await prisma.invoice.groupBy({
    by: ['status'],
    where: { organizationId: org.id },
    _count: true,
  });
  console.log(`Created ${n} demo invoices:`);
  for (const r of byStatus) console.log(`  ${r.status.padEnd(9)} ${r._count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
