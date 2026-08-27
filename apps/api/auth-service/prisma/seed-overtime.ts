import { PrismaClient } from '@prisma/client';

/*
  Overtime requests across every state the workflow can reach.
  
  The local database held nine, ALL of them EXPIRED_NO_RESPONSE, so seven of
  the eight states rendered nowhere and the screen could not be judged. Each
  request needs its own TimeEntry — the relation is unique — so a matching shift
  is created for every one.

  Times are relative to now, so re-running keeps a pending request genuinely
  pending rather than one that timed out months ago.
*/
const prisma = new PrismaClient();

const MIN = 60_000;
const ago = (m: number) => new Date(Date.now() - m * MIN);
const ahead = (m: number) => new Date(Date.now() + m * MIN);

/** [status, minutes ago the shift started, reason, extra] */
const PLAN: Array<{
  status: string;
  startedMinAgo: number;
  reason?: string;
  approval?: 'REMOTE' | 'SIGNATURE';
  rejection?: string;
  notes?: string;
  maxMinutes?: number;
  live?: boolean;
}> = [
  // Waiting on the technician — the 15-minute window is still open.
  { status: 'PENDING_TECHNICIAN', startedMinAgo: 505 },
  { status: 'PENDING_TECHNICIAN', startedMinAgo: 500 },

  // Technician said yes; a leader has ten minutes to answer.
  { status: 'PENDING_APPROVAL', startedMinAgo: 520, reason: 'Heizung noch nicht dicht, brauche 45 Min' },
  { status: 'PENDING_APPROVAL', startedMinAgo: 515, reason: 'Kunde wartet auf Abnahme' },

  // Approved and RUNNING — the state the live view exists for.
  { status: 'APPROVED', startedMinAgo: 560, reason: 'Störung Stadtwerke, Anlage läuft noch nicht',
    approval: 'REMOTE', maxMinutes: 60, live: true },
  { status: 'APPROVED', startedMinAgo: 545, reason: 'Ersatzteil kam spät',
    approval: 'SIGNATURE', maxMinutes: 90, live: true },

  // Finished normally.
  { status: 'COMPLETED', startedMinAgo: 1_800, reason: 'Notdienst Hotel Seeblick',
    approval: 'REMOTE', maxMinutes: 120, notes: 'Abgerechnet' },
  { status: 'COMPLETED', startedMinAgo: 2_900, reason: 'Rohrbruch, Wasser abgestellt',
    approval: 'SIGNATURE', maxMinutes: 60 },

  // Refused, with a reason a person actually wrote.
  { status: 'REJECTED', startedMinAgo: 1_500, reason: 'Würde gern fertig machen',
    rejection: 'Kann morgen früh erledigt werden — kein Notfall' },

  // The technician declined the offer.
  { status: 'CANCELED', startedMinAgo: 2_000 },

  // Nobody answered in time. Both timeout paths, which are different failures:
  // the technician never replied, or the leader never did.
  { status: 'EXPIRED_NO_RESPONSE', startedMinAgo: 3_100 },
  { status: 'EXPIRED_NO_APPROVAL', startedMinAgo: 3_400, reason: 'Anlage noch offen' },
];

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: 'Acme Corporation' },
    select: { id: true },
  });
  if (!org) throw new Error('No "Acme Corporation" organization — run the demo seed first.');

  const [staff, locations, approver] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: org.id, role: 'EMPLOYEE', isActive: true },
      select: { id: true, firstName: true },
      take: 8,
    }),
    prisma.companyLocation.findMany({
      where: { organizationId: org.id, isActive: true, isRemote: false },
      select: { id: true },
      take: 4,
    }),
    prisma.user.findFirst({ where: { organizationId: org.id, role: 'ADMIN' }, select: { id: true } }),
  ]);
  if (!staff.length || !locations.length || !approver) {
    throw new Error('Need employees, a location and an admin — run the demo seed first.');
  }

  // Re-runnable, and scoped: only the entries this script made. Deleting the
  // request leaves its TimeEntry behind, so both go, in that order.
  const mine = await prisma.overtimeRequest.findMany({
    where: { organizationId: org.id, approverNotes: { startsWith: 'demo:' } },
    select: { id: true, timeEntryId: true },
  });
  if (mine.length) {
    await prisma.overtimeRequest.deleteMany({ where: { id: { in: mine.map((m) => m.id) } } });
    await prisma.timeEntry.deleteMany({ where: { id: { in: mine.map((m) => m.timeEntryId) } } });
    console.log(`Removed ${mine.length} previous demo overtime requests`);
  }

  let n = 0;
  for (const p of PLAN) {
    const who = staff[n % staff.length]!;
    const loc = locations[n % locations.length]!;
    n++;

    // A shift that has already run past its normal end — which is the only
    // reason an overtime request exists at all.
    const entry = await prisma.timeEntry.create({
      data: {
        user: { connect: { id: who.id } },
        location: { connect: { id: loc.id } },
        organization: { connect: { id: org.id } },
        clockInAt: ago(p.startedMinAgo),
        clockInLat: 47.9813 + n * 0.001,
        clockInLng: 13.8269 + n * 0.001,
        clockInWithinGeofence: true,
        status: p.live ? 'CLOCKED_IN' : 'CLOCKED_OUT',
        clockOutAt: p.live ? null : ago(Math.max(0, p.startedMinAgo - 540)),
      },
    });

    const decided = ['APPROVED', 'COMPLETED', 'REJECTED'].includes(p.status);
    await prisma.overtimeRequest.create({
      data: {
        technicianId: who.id,
        timeEntryId: entry.id,
        locationId: loc.id,
        organizationId: org.id,
        status: p.status as any,
        technicianReason: p.reason ?? null,
        technicianRespondedAt: p.status === 'PENDING_TECHNICIAN' ? null : ago(p.startedMinAgo - 480),
        approvalMethod: (p.approval as any) ?? null,
        approvedById: decided && p.status !== 'REJECTED' ? approver.id : null,
        approvedAt: decided && p.status !== 'REJECTED' ? ago(p.startedMinAgo - 485) : null,
        rejectedAt: p.status === 'REJECTED' ? ago(p.startedMinAgo - 485) : null,
        rejectionReason: p.rejection ?? null,
        // Tagged so a re-run can find exactly what it created and nothing else.
        approverNotes: `demo:${p.notes ?? ''}`,
        leaderName: p.approval === 'SIGNATURE' ? 'Anna Müller' : null,
        maxDurationMinutes: p.maxMinutes ?? null,
        overtimeStartAt: decided ? ago(p.startedMinAgo - 485) : null,
        overtimeEndAt: p.status === 'COMPLETED' ? ago(p.startedMinAgo - 545) : null,
        // Only a request still waiting has a live deadline; a settled one must
        // not look like it is counting down.
        technicianTimeoutAt: p.status === 'PENDING_TECHNICIAN' ? ahead(9) : null,
        approvalTimeoutAt: p.status === 'PENDING_APPROVAL' ? ahead(6) : null,
      },
    });
  }

  const byStatus = await prisma.overtimeRequest.groupBy({
    by: ['status'], where: { organizationId: org.id }, _count: true,
  });
  console.log(`Created ${n} overtime requests:`);
  for (const r of byStatus.sort((a, b) => b._count - a._count)) {
    console.log(`  ${r.status.padEnd(20)} ${r._count}`);
  }
}

main()
  .catch((e) => { console.error(e.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
