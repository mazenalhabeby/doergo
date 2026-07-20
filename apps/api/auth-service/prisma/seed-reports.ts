/**
 * Seed realistic reporting data for the demo org (client@example.com / Acme).
 * Fills every analytics dataset: attendance (time_entries), tasks, and
 * service_reports + customers. Idempotent: re-running replaces its own rows
 * (marked via notes/description = MARKER) and leaves pre-existing data intact.
 *
 * Run from apps/api/auth-service:  npx tsx prisma/seed-reports.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MARKER = 'seed-reports';
const DAY = 86_400_000;

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const rint = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const chance = (p: number) => Math.random() < p;

const CUSTOMERS = [
  { name: 'Siemens AG', contactName: 'Klaus Berger', email: 'facility@siemens.example', phone: '+43 1 234 5601', address: 'Siemensstraße 90, 1210 Wien' },
  { name: 'REWE Group', contactName: 'Petra Huber', email: 'service@rewe.example', phone: '+43 1 234 5602', address: 'Industriezentrup NÖ-Süd, 2355 Wr. Neudorf' },
  { name: 'OMV Downstream', contactName: 'Martin Gruber', email: 'maintenance@omv.example', phone: '+43 1 234 5603', address: 'Trabrennstraße 6-8, 1020 Wien' },
  { name: 'SPAR Österreich', contactName: 'Julia Steiner', email: 'technik@spar.example', phone: '+43 662 4470', address: 'Europastraße 3, 5015 Salzburg' },
  { name: 'voestalpine', contactName: 'Andreas Mayr', email: 'plant@voest.example', phone: '+43 50304', address: 'voestalpine-Straße 1, 4020 Linz' },
  { name: 'Red Bull GmbH', contactName: 'Sophie Wolf', email: 'ops@redbull.example', phone: '+43 662 6582', address: 'Am Brunnen 1, 5330 Fuschl' },
  { name: 'Wien Energie', contactName: 'Thomas Fischer', email: 'grid@wienenergie.example', phone: '+43 800 500 800', address: 'Thomas-Klestil-Platz 14, 1030 Wien' },
  { name: 'BILLA AG', contactName: 'Nina Reiter', email: 'store-tech@billa.example', phone: '+43 2236 600', address: 'IZ NÖ-Süd, 2355 Wr. Neudorf' },
];

const TASK_TITLES = [
  'HVAC quarterly maintenance', 'Electrical panel inspection', 'Refrigeration unit repair',
  'Emergency plumbing leak', 'Fire alarm system test', 'Boiler annual service',
  'Lighting retrofit', 'Access control install', 'Generator load test',
  'Ventilation filter change', 'Cooling tower cleaning', 'UPS battery replacement',
  'Roof water ingress fix', 'Door closer adjustment', 'CCTV camera replacement',
];
const SUMMARIES = [
  'Completed scheduled maintenance, all systems nominal.',
  'Diagnosed fault, replaced failed component, tested OK.',
  'Repaired leak and pressure-tested the line.',
  'Inspected and certified; no defects found.',
  'Serviced unit, cleaned filters, recalibrated controls.',
];
const STATUSES_OPEN = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'EN_ROUTE', 'BLOCKED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'client@example.com' }, select: { organizationId: true } });
  if (!admin) throw new Error('client@example.com not found — is the demo seed applied?');
  const organizationId = admin.organizationId;
  console.log(`Seeding reports data for org ${organizationId}`);

  const techs = await prisma.user.findMany({ where: { organizationId, role: 'EMPLOYEE' }, select: { id: true } });
  const spaces = await prisma.companyLocation.findMany({ where: { organizationId }, select: { id: true, isRemote: true, lat: true, lng: true } });
  if (!techs.length || !spaces.length) throw new Error('No technicians or spaces in the org');
  const physical = spaces.filter((s) => !s.isRemote);
  const techIds = techs.map((t) => t.id);

  // ── Clean previous seed rows (idempotent) ─────────────────────────────────
  await prisma.timeEntry.deleteMany({ where: { organizationId, notes: MARKER } });
  await prisma.task.deleteMany({ where: { organizationId, description: MARKER } }); // cascades service_reports
  console.log('Cleared previous seed-reports rows');

  // ── Customers (upsert by name) ────────────────────────────────────────────
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({ where: { organizationId, name: c.name }, select: { id: true } });
    const row = existing
      ? await prisma.customer.update({ where: { id: existing.id }, data: { ...c }, select: { id: true } })
      : await prisma.customer.create({ data: { ...c, organizationId }, select: { id: true } });
    customerIds.push(row.id);
  }
  console.log(`Customers: ${customerIds.length}`);

  // ── Attendance: ~last 70 days, weekdays, 6 of N techs per day ──────────────
  const entries: any[] = [];
  for (let d = 70; d >= 0; d--) {
    const date = new Date(Date.now() - d * DAY);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const workingToday = [...techIds].sort(() => Math.random() - 0.5).slice(0, Math.min(6, techIds.length));
    for (const userId of workingToday) {
      const remote = chance(0.12);
      const loc = remote ? (spaces.find((s) => s.isRemote) || pick(physical)) : pick(physical);
      const clockInAt = new Date(date); clockInAt.setHours(rint(7, 9), rint(0, 59), 0, 0);
      const totalMinutes = rint(390, 585); // 6.5h – 9.75h
      const breakMinutes = rint(20, 55);
      const overtime = totalMinutes > 500;
      const clockOutAt = new Date(clockInAt.getTime() + (totalMinutes + breakMinutes) * 60_000);
      entries.push({
        organizationId, userId, locationId: loc.id, status: 'CLOCKED_OUT',
        clockInAt, clockOutAt,
        clockInLat: loc.lat ?? 47.9813, clockInLng: loc.lng ?? 13.8269,
        clockOutLat: loc.lat ?? 47.9813, clockOutLng: loc.lng ?? 13.8269,
        totalMinutes, breakMinutes, isRemote: remote,
        flagReasons: overtime ? ['OVERTIME'] : [],
        approvalStatus: overtime ? 'APPROVED' : 'AUTO',
        notes: MARKER,
      });
    }
  }
  await prisma.timeEntry.createMany({ data: entries });
  console.log(`Time entries: ${entries.length}`);

  // ── Tasks (+ service reports for completed ones), last 90 days ─────────────
  let taskCount = 0, reportCount = 0;
  for (let i = 0; i < 55; i++) {
    const created = new Date(Date.now() - rint(0, 90) * DAY);
    const assignedToId = pick(techIds);
    const spaceId = pick(physical).id;
    const customerId = chance(0.85) ? pick(customerIds) : null;
    const done = chance(0.6);
    const status = done ? (chance(0.75) ? 'COMPLETED' : 'CLOSED') : pick(STATUSES_OPEN);
    const task = await prisma.task.create({
      data: {
        organizationId, title: pick(TASK_TITLES), description: MARKER,
        status, priority: pick(PRIORITIES as unknown as string[]) as any,
        createdById: assignedToId, assignedToId, spaceId, customerId,
        createdAt: created, updatedAt: created,
        routeDistance: chance(0.7) ? rint(1200, 48000) : null, // metres
        dueDate: new Date(created.getTime() + rint(1, 10) * DAY),
      },
      select: { id: true },
    });
    taskCount++;
    if (done) {
      const completedAt = new Date(created.getTime() + rint(1, 6) * DAY);
      const cust = customerId ? CUSTOMERS[customerIds.indexOf(customerId)] : null;
      await prisma.serviceReport.create({
        data: {
          taskId: task.id, organizationId,
          summary: pick(SUMMARIES),
          workPerformed: 'Work carried out per the service checklist; parts and labour logged.',
          workDuration: rint(1800, 16200), // 30 min – 4.5 h (seconds)
          completedAt, completedById: assignedToId,
          customerId, customerName: cust?.name ?? 'Walk-in',
        },
      });
      reportCount++;
    }
  }
  console.log(`Tasks: ${taskCount}  Service reports: ${reportCount}`);
  console.log('✅ Reports data seeded.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
