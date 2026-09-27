/**
 * Test data for the Extra time approvals screen — requests waiting on the
 * org owner (client@example.com), made the way the app makes them.
 *
 *   npx tsx prisma/seed-extra-time-test.ts           add them
 *   npx tsx prisma/seed-extra-time-test.ts --remove  take them away again
 *
 * Three members are on the clock past their shift end with a request waiting
 * (the everyday case), and one already clocked out with the request still
 * undecided (a phone that sent both late). Every row carries the marker note
 * below, so `--remove` deletes exactly these and nothing real.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MARK = '[extra-time-test]';

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: 'client@example.com' } });
  if (!owner?.organizationId) throw new Error('client@example.com has no organization — seed the demo first');
  const org = owner.organizationId;

  if (process.argv.includes('--remove')) {
    const rows = await prisma.timeEntry.findMany({ where: { organizationId: org, notes: MARK }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    await prisma.overtimeRequest.deleteMany({ where: { timeEntryId: { in: ids } } });
    await prisma.timeEntry.deleteMany({ where: { id: { in: ids } } });
    console.log(`removed ${ids.length} test shifts`);
    return;
  }

  const space = await prisma.companyLocation.findFirst({ where: { organizationId: org, name: 'Main Office', isActive: true } })
    ?? await prisma.companyLocation.findFirst({ where: { organizationId: org, isActive: true, isRemote: false } });
  if (!space) throw new Error('no workspace in the organization');

  const today = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const now = new Date();

  // [email, clock-in, shift end, asked at, still on the clock?]
  const plan: Array<[string, Date, Date, Date, boolean]> = [
    ['mike@example.com', today(7), today(15), today(15, 5), true],
    ['sarah@example.com', today(8), today(16), new Date(Math.min(now.getTime(), today(16, 2).getTime())), true],
    ['karim@example.com', today(6, 30), today(14, 30), today(14, 40), true],
    ['lisa@example.com', today(7), today(15), today(15, 10), false],
  ];

  for (const [email, clockInAt, endAt, askedAt, open] of plan) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.organizationId !== org) { console.log(`skip ${email}: not in the organization`); continue; }
    if (open) {
      const running = await prisma.timeEntry.findFirst({ where: { userId: user.id, status: 'CLOCKED_IN' } });
      if (running) { console.log(`skip ${email}: already on the clock (a member has one open shift)`); continue; }
    }
    const clockOutAt = open ? null : new Date(Math.min(now.getTime(), today(16, 20).getTime()));
    const minutes = clockOutAt ? Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60_000) : null;
    const entry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        organizationId: org,
        locationId: space.id,
        status: open ? 'CLOCKED_IN' : 'CLOCKED_OUT',
        clockInAt,
        clockInLat: space.lat ?? 0,
        clockInLng: space.lng ?? 0,
        clockInWithinGeofence: true,
        clockOutAt,
        clockOutLat: clockOutAt ? space.lat : null,
        clockOutLng: clockOutAt ? space.lng : null,
        clockOutWithinGeofence: clockOutAt ? true : null,
        totalMinutes: minutes,
        timezone: space.timezone,
        expectedClockInAt: clockInAt,
        expectedClockOutAt: endAt,
        reminderState: 'OVERTIME_PENDING',
        notes: MARK,
      },
    });
    await prisma.overtimeRequest.create({
      data: {
        timeEntryId: entry.id,
        cycle: 1,
        technicianId: user.id,
        locationId: space.id,
        organizationId: org,
        status: 'PENDING_APPROVAL',
        technicianRespondedAt: askedAt,
        overtimeStartAt: endAt,
      },
    });
    console.log(`${email}: ${open ? 'on the clock' : 'clocked out'}, shift ended ${endAt.toTimeString().slice(0, 5)}, asked for extra time`);
  }
}

main().finally(() => prisma.$disconnect());
