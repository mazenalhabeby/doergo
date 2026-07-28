/**
 * Seed rich attendance (TimeEntry + Break) for every EMPLOYEE, both demo orgs.
 * ~25 working days of history each: normal shifts, breaks, remote days, geofence
 * flags, late arrivals, overtime, mixed approval states, a few auto-clock-outs,
 * and some currently-clocked-in (on-the-clock now).
 * Idempotent: wipes existing TimeEntry/Break/OvertimeRequest for those employees.
 * Run:  npx tsx prisma/seed-attendance.ts   (from apps/api/auth-service)
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const now = new Date();
function dayAt(daysAgo: number, hour: number, min: number) {
  const dt = new Date(now);
  dt.setDate(dt.getDate() - daysAgo);
  dt.setHours(hour, min, 0, 0);
  return dt;
}
const jit = (i: number, mod: number, add = 0) => ((i * 41 + add) % mod);
const REMOTE_PLACES = ['Vienna, AT', 'Linz, AT', 'Graz, AT', 'Salzburg, AT', 'Wels, AT'];

async function pickApprover(orgId: string): Promise<string | null> {
  const a = await p.user.findFirst({ where: { organizationId: orgId, role: 'ADMIN' }, select: { id: true } });
  if (a) return a.id;
  const m = await p.user.findFirst({ where: { organizationId: orgId, canManageUsers: true }, select: { id: true } });
  return m?.id ?? null;
}

async function main() {
  const emps = await p.user.findMany({ where: { role: 'EMPLOYEE' }, select: { id: true, organizationId: true } });
  const ids = emps.map((e) => e.id);

  // wipe existing attendance for these employees (order: overtime -> breaks -> entries)
  await p.overtimeRequest.deleteMany({ where: { timeEntry: { userId: { in: ids } } } }).catch(() => {});
  await p.break.deleteMany({ where: { timeEntry: { userId: { in: ids } } } });
  await p.timeEntry.deleteMany({ where: { userId: { in: ids } } });

  // per-org: geofenced locations (valid coords) + approver
  const orgLocs = new Map<string, { id: string; lat: number; lng: number }[]>();
  const orgApprover = new Map<string, string | null>();
  for (const orgId of [...new Set(emps.map((e) => e.organizationId).filter(Boolean))] as string[]) {
    const locs = await p.companyLocation.findMany({ where: { organizationId: orgId, lat: { not: null }, lng: { not: null } }, select: { id: true, lat: true, lng: true } });
    orgLocs.set(orgId, locs.map((l) => ({ id: l.id, lat: l.lat as number, lng: l.lng as number })));
    orgApprover.set(orgId, await pickApprover(orgId));
  }

  let entryCount = 0, breakCount = 0, activeCount = 0;
  const WORKDAYS = 25; // working days of history

  for (let i = 0; i < emps.length; i++) {
    const e = emps[i];
    if (!e.organizationId) continue;
    const locs = orgLocs.get(e.organizationId) ?? [];
    if (!locs.length) continue;
    const approver = orgApprover.get(e.organizationId) ?? null;
    const homeLoc = locs[i % locs.length];

    let seeded = 0;
    let dayCursor = 1; // start yesterday, walk back skipping weekends
    while (seeded < WORKDAYS && dayCursor < 60) {
      const dt = new Date(now); dt.setDate(dt.getDate() - dayCursor);
      const dow = dt.getDay();
      dayCursor++;
      if (dow === 0 || dow === 6) continue; // weekdays only
      seeded++;
      const k = seeded + i;

      const remote = k % 7 === 0;
      const loc = remote ? homeLoc : locs[(i + seeded) % locs.length];
      const late = k % 11 === 0;
      const overtime = k % 9 === 0;
      const outsideGeofence = !remote && k % 13 === 0;
      const autoOut = k % 17 === 0;

      const inH = late ? 9 : 8, inM = late ? 20 + jit(k, 30) : jit(k, 25);
      const outBase = overtime ? 19 : 17;
      const outH = outBase, outM = jit(k, 40);
      const clockIn = dayAt(dayCursor - 1, inH, inM);
      const clockOut = dayAt(dayCursor - 1, outH, outM);

      // breaks: always a lunch, sometimes a short break
      const lunchMin = 30 + jit(k, 31); // 30–60
      const shortBreak = k % 3 === 0;
      const shortMin = shortBreak ? 10 + jit(k, 6) : 0;
      const breakMinutes = lunchMin + shortMin;
      const totalMinutes = Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) - breakMinutes);

      const flags: string[] = [];
      if (late) flags.push('LATE_ARRIVAL');
      if (overtime) flags.push('OVERTIME');
      if (outsideGeofence) flags.push('OUTSIDE_GEOFENCE');
      if (autoOut) flags.push('MISSING_CLOCKOUT');

      // approval: clean days auto-approve; flagged days go PENDING, some decided
      let approvalStatus: 'AUTO' | 'PENDING' | 'APPROVED' | 'REJECTED' = flags.length ? 'PENDING' : 'AUTO';
      let approvedById: string | null = null, approvedAt: Date | null = null, approvalNotes: string | null = null;
      if (flags.length && k % 2 === 0) { approvalStatus = 'APPROVED'; approvedById = approver; approvedAt = dayAt(dayCursor - 2, 9, 0); approvalNotes = overtime ? 'Approved overtime for project deadline' : 'Reviewed and approved'; }
      else if (flags.length && k % 5 === 0) { approvalStatus = 'REJECTED'; approvedById = approver; approvedAt = dayAt(dayCursor - 2, 9, 0); approvalNotes = 'Please clock times accurately'; }

      const entry = await p.timeEntry.create({
        data: {
          userId: e.id,
          organizationId: e.organizationId,
          locationId: loc.id,
          status: autoOut ? 'AUTO_OUT' : 'CLOCKED_OUT',
          clockInAt: clockIn,
          clockInLat: remote ? 48.2 + i * 0.001 : loc.lat + (jit(k, 9) - 4) * 0.0002,
          clockInLng: remote ? 16.37 + i * 0.001 : loc.lng + (jit(k, 9, 3) - 4) * 0.0002,
          clockInAccuracy: 8 + jit(k, 20),
          clockOutAt: clockOut,
          clockOutLat: remote ? 48.2 + i * 0.001 : loc.lat + (jit(k, 9, 5) - 4) * 0.0002,
          clockOutLng: remote ? 16.37 + i * 0.001 : loc.lng + (jit(k, 9, 7) - 4) * 0.0002,
          clockOutAccuracy: 8 + jit(k, 20),
          clockInWithinGeofence: remote ? true : !outsideGeofence,
          clockOutWithinGeofence: remote ? true : !outsideGeofence,
          isRemote: remote,
          clockInPlace: remote ? REMOTE_PLACES[i % REMOTE_PLACES.length] : null,
          clockOutPlace: remote ? REMOTE_PLACES[i % REMOTE_PLACES.length] : null,
          totalMinutes,
          breakMinutes,
          notes: remote ? 'Working from home' : autoOut ? 'Auto clocked-out by system at end of day' : null,
          flagReasons: flags,
          approvalStatus,
          approvedById,
          approvedAt,
          approvalNotes,
        },
      });
      entryCount++;

      // lunch break (mid-shift)
      const lunchStart = new Date(clockIn.getTime() + 4 * 3600_000);
      await p.break.create({ data: { timeEntryId: entry.id, type: 'LUNCH', startedAt: lunchStart, endedAt: new Date(lunchStart.getTime() + lunchMin * 60000), durationMinutes: lunchMin } });
      breakCount++;
      if (shortBreak) {
        const sStart = new Date(clockIn.getTime() + 2 * 3600_000);
        await p.break.create({ data: { timeEntryId: entry.id, type: 'SHORT', startedAt: sStart, endedAt: new Date(sStart.getTime() + shortMin * 60000), durationMinutes: shortMin, notes: 'Coffee' } });
        breakCount++;
      }
    }

    // some employees are currently ON THE CLOCK (today, not clocked out yet)
    if (i % 3 === 0) {
      const loc = homeLoc;
      const inToday = new Date(now); inToday.setHours(8, 5 + jit(i, 20), 0, 0);
      if (inToday < now) {
        await p.timeEntry.create({
          data: {
            userId: e.id, organizationId: e.organizationId, locationId: loc.id,
            status: 'CLOCKED_IN',
            clockInAt: inToday,
            clockInLat: loc.lat + 0.0001, clockInLng: loc.lng + 0.0001, clockInAccuracy: 10,
            clockInWithinGeofence: true, isRemote: false, breakMinutes: 0,
            flagReasons: [], approvalStatus: 'AUTO',
          },
        });
        entryCount++; activeCount++;
      }
    }
  }

  console.log(`Done. Created ${entryCount} time entries (${activeCount} currently clocked-in) and ${breakCount} breaks.`);
  const byStatus = await p.timeEntry.groupBy({ by: ['status'], _count: true });
  const byApproval = await p.timeEntry.groupBy({ by: ['approvalStatus'], _count: true });
  console.log('By status:', byStatus.map((s) => `${s.status}=${s._count}`).join('  '));
  console.log('By approval:', byApproval.map((s) => `${s.approvalStatus}=${s._count}`).join('  '));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
