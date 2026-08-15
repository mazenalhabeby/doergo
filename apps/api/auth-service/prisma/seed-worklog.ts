/**
 * Seed work-log notes onto existing attendance sessions so the "what I did today"
 * timeline shows populated data for testing (web admin attendance rows + the
 * member's /my/attendance). Text notes only — test photo upload live via the UI.
 *
 * Run from apps/api/auth-service:  npx tsx prisma/seed-worklog.ts
 * Idempotent-ish: only touches sessions that have no work-log yet.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACTIVITIES = [
  'Finished servicing the AC unit in room 3',
  'Completed the morning inventory count',
  'Fixed the conveyor belt motor',
  'Replaced the filters on the ventilation system',
  'Cleaned and inspected the machinery',
  'Loaded the delivery truck for the afternoon route',
  'Wrapped up maintenance on the compressor',
  'Reviewed and closed 4 open tickets',
  'Calibrated the sensors on line 2',
  'Restocked the parts shelf',
  'Handed over shift notes to the next crew',
  'Tested the backup generator — all good',
  'Repaired the leak in the main pipe',
  'Painted the loading-dock markings',
  'Updated the equipment log',
  'Met the client and walked the site',
  'Finished the electrical panel wiring',
  'Swept and secured the work area',
];

function pick<T>(arr: T[], n: number): T[] {
  const c = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return out;
}

async function main() {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const entries = await prisma.timeEntry.findMany({
    where: { clockInAt: { gte: since }, workLog: { none: {} } },
    select: { id: true, userId: true, organizationId: true, clockInAt: true, clockOutAt: true },
    orderBy: { clockInAt: 'desc' },
    take: 40,
  });
  console.log(`Found ${entries.length} session(s) without a work-log — seeding notes…`);

  let total = 0;
  for (const e of entries) {
    const start = e.clockInAt.getTime();
    const end = (e.clockOutAt ?? new Date()).getTime();
    const span = Math.max(end - start, 2 * 60 * 60 * 1000); // ≥2h so notes spread out
    const count = 3 + Math.floor(Math.random() * 3); // 3–5 notes
    const bodies = pick(ACTIVITIES, count);
    const times = Array.from({ length: count }, (_, i) => new Date(start + ((i + 1) / (count + 1)) * span));
    await prisma.timeEntryNote.createMany({
      data: bodies.map((body, i) => ({
        timeEntryId: e.id,
        userId: e.userId,
        organizationId: e.organizationId,
        body,
        at: times[i],
      })),
    });
    total += count;
  }
  console.log(`✔ Seeded ${total} work-log note(s) across ${entries.length} session(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
