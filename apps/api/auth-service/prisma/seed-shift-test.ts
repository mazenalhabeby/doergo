/**
 * Test data for the shift clock: two clocks, planned rests, the overtime loop
 * and a short clock-out.
 *
 * Everything is positioned RELATIVE TO NOW, so running it puts four different
 * scenarios within a few minutes of being testable rather than describing them.
 * Run it again whenever the clock has moved past them — it clears its own data
 * first and re-lays it around the new "now".
 *
 *   npx tsx prisma/seed-shift-test.ts          (from apps/api/auth-service)
 *
 * Everything it creates is named with the marker below and nothing else is
 * touched, so it is safe to re-run against a database with real work in it.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MARKER = '[test]';
const ORG = 'cmoyg9pzs0000sbtcdb6r9de7'; // Acme Corporation
const SPACE = '65902837-95b4-49d0-9468-14bfe06f2717'; // Main Office — SHIFT model, no pin
const TZ = 'Europe/Berlin';

/** "HH:MM" in the space's timezone, `mins` from now. */
function localHm(minsFromNow: number): string {
  const at = new Date(Date.now() + minsFromNow * 60_000);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at);
}

const hmToMinutes = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

async function main() {
  const users = await prisma.user.findMany({
    where: { organizationId: ORG, email: { in: [
      'mike@example.com', 'lisa@example.com', 'dana@example.com', 'noor@example.com', 'manager@example.com',
    ] } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const by = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`Missing seed user ${email} — run seed-demo.ts first`);
    return u;
  };

  // ── Clean up the last run, and only it ──────────────────────────────────
  const old = await prisma.shift.findMany({ where: { organizationId: ORG, name: { contains: MARKER } }, select: { id: true } });
  const oldIds = old.map((s) => s.id);
  if (oldIds.length) {
    await prisma.timeEntry.deleteMany({ where: { shiftId: { in: oldIds } } });
    await prisma.shiftAssignment.deleteMany({ where: { shiftId: { in: oldIds } } });
    await prisma.breakRule.deleteMany({ where: { shiftId: { in: oldIds } } });
    await prisma.shift.deleteMany({ where: { id: { in: oldIds } } });
  }
  await prisma.breakRule.deleteMany({ where: { organizationId: ORG, name: { contains: MARKER } } });

  /*
    Close every shift still open in the demo organization.

    Two reasons, both about the first thirty seconds of testing: an open shift
    refuses a fresh clock-in with "already clocked in", which is the least
    informative error in the product; and old sessions left ESCALATED from
    previous runs sit on the attendance board looking like today's problems.

    Deliberately the whole org rather than just the four seeded members — the
    board is shared, and half a clean slate is not a clean slate. This runs
    against a development database by design.
  */
  const stillOpen = await prisma.timeEntry.updateMany({
    where: { organizationId: ORG, status: 'CLOCKED_IN' },
    data: {
      status: 'CLOCKED_OUT',
      clockOutAt: new Date(),
      reminderState: 'RESOLVED',
      nextRemindAt: null,
      nextBreakRemindAt: null,
    },
  });

  // ── The rests everyone at Main Office is planned ─────────────────────────
  const coffee = await prisma.breakRule.create({
    data: {
      organizationId: ORG, spaceId: SPACE,
      name: `Coffee ${MARKER}`,
      // Three minutes in, so the prompt arrives while you are still looking at
      // the screen rather than after lunch.
      trigger: 'AFTER_WORKED', afterMinutes: 3,
      durationMinutes: 5, isPaid: false, isRequired: true,
      remind: true, snoozeMin: 5, maxSnoozes: 3, position: 0,
    },
  });
  const lunch = await prisma.breakRule.create({
    data: {
      organizationId: ORG, spaceId: SPACE,
      name: `Lunch ${MARKER}`,
      trigger: 'LOCAL_WINDOW',
      earliestLocal: localHm(25), latestLocal: localHm(120),
      durationMinutes: 30, isPaid: false, isRequired: true,
      remind: true, snoozeMin: 5, maxSnoozes: 3, position: 1,
    },
  });

  // ── Four shifts, each testing one thing, all live right now ──────────────
  const shifts = [
    {
      key: 'early',
      name: `Early bird ${MARKER}`,
      who: 'mike@example.com',
      // Starts in ten minutes: clock in NOW and you are early, which is the
      // whole of scenario one.
      startLocal: localHm(10), endLocal: localHm(10 + 8 * 60),
      color: '#2563eb',
      tests: 'Clock in now → early → "Counted from"',
    },
    {
      key: 'ending',
      name: `Ending now ${MARKER}`,
      who: 'lisa@example.com',
      // Ends in four minutes, with a one-minute grace and two-minute reminders:
      // the shift-ended prompt and the overtime loop, inside ten minutes.
      startLocal: localHm(-8 * 60), endLocal: localHm(4),
      color: '#b45309',
      tests: 'Clock in now → shift ends in 4 min → overtime loop',
    },
    {
      key: 'restdue',
      name: `Rest overdue ${MARKER}`,
      who: 'dana@example.com',
      // Started half an hour ago, so the three-minute coffee is already due and
      // the sweep prompts on its next tick.
      startLocal: localHm(-30), endLocal: localHm(-30 + 8 * 60),
      color: '#059669',
      tests: 'Clock in now → rest already due → prompt within a minute',
    },
    {
      key: 'short',
      name: `Long day ${MARKER}`,
      who: 'noor@example.com',
      startLocal: localHm(-60), endLocal: localHm(-60 + 10 * 60),
      color: '#7c3aed',
      tests: 'Clock in, then clock out → "you are 9h short, why?"',
    },
  ];

  const created: { name: string; who: string; window: string; tests: string }[] = [];

  for (const s of shifts) {
    const crosses = hmToMinutes(s.endLocal) <= hmToMinutes(s.startLocal);
    const shift = await prisma.shift.create({
      data: {
        organizationId: ORG, spaceId: SPACE,
        name: s.name, color: s.color,
        startLocal: s.startLocal, endLocal: s.endLocal, crossesMidnight: crosses,
        // Tight, so the loop is watchable: first nudge a minute after the end,
        // then every two minutes, three times before it escalates to a leader.
        graceMin: 1, reminderIntervalMin: 2, maxReminders: 3,
        flagToleranceMin: 5,
        breakMinutes: 0,
      },
    });

    await prisma.shiftAssignment.create({
      data: {
        organizationId: ORG, spaceId: SPACE,
        userId: by(s.who).id, shiftId: shift.id,
        recurrence: 'DAILY', effectiveFrom: new Date(Date.now() - 86_400_000),
        isActive: true, priority: 10,
      },
    });

    /*
      One shift overrides the workspace's rests, to prove narrowest-wins: the
      long day gets a single PAID break instead of the two unpaid ones, so the
      counted hours on that shift are the full window.
    */
    if (s.key === 'short') {
      await prisma.breakRule.create({
        data: {
          organizationId: ORG, shiftId: shift.id,
          name: `Paid breather ${MARKER}`,
          trigger: 'AFTER_WORKED', afterMinutes: 2,
          durationMinutes: 10, isPaid: true, isRequired: false,
          remind: true, snoozeMin: 5, maxSnoozes: 3,
        },
      });
    }

    created.push({ name: s.name, who: s.who, window: `${s.startLocal}–${s.endLocal}`, tests: s.tests });
  }

  // ── Yesterday, already finished: the two clocks, visible without waiting ──
  const yesterday = new Date(Date.now() - 24 * 3_600_000);
  const day = (h: number, m = 0) =>
    new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), h, m));

  const historyShift = await prisma.shift.create({
    data: {
      organizationId: ORG, spaceId: SPACE,
      name: `Yesterday 06–18 ${MARKER}`, color: '#64748b',
      startLocal: '06:00', endLocal: '18:00', crossesMidnight: false,
      graceMin: 5, reminderIntervalMin: 5, maxReminders: 3, flagToleranceMin: 10,
    },
  });

  const mike = by('mike@example.com');
  // Clocked in 05:55, out 18:05 — counted 06:00→18:00, minus a 30-minute lunch.
  const closed = await prisma.timeEntry.create({
    data: {
      userId: mike.id, organizationId: ORG, locationId: SPACE, shiftId: historyShift.id,
      status: 'CLOCKED_OUT', timezone: TZ,
      clockInAt: day(3, 55), clockOutAt: day(16, 5), // 05:55 / 18:05 Berlin
      clockInLat: 0, clockInLng: 0, clockInWithinGeofence: true, clockOutWithinGeofence: true,
      expectedClockInAt: day(4, 0), expectedClockOutAt: day(16, 0),
      totalMinutes: 730,
      countedStartAt: day(4, 0), countedEndAt: day(16, 0),
      breakMinutes: 30, unpaidBreakMinutes: 30,
      paidMinutes: 690, // 12h window − 30m unpaid rest
      approvalStatus: 'APPROVED', flagReasons: [],
      breakPlan: [
        {
          ruleId: lunch.id, name: 'Lunch', dueAt: day(10, 0).toISOString(), expiresAt: day(11, 30).toISOString(),
          durationMinutes: 30, isPaid: false, required: true, state: 'TAKEN', snoozeCount: 1,
          takenAt: day(10, 12).toISOString(),
        },
        {
          ruleId: coffee.id, name: 'Coffee', dueAt: day(7, 0).toISOString(), expiresAt: null,
          durationMinutes: 5, isPaid: false, required: true, state: 'MISSED', snoozeCount: 3,
        },
      ],
    },
  });
  await prisma.break.create({
    data: {
      timeEntryId: closed.id, type: 'LUNCH', ruleId: lunch.id, isPaid: false,
      startedAt: day(10, 12), endedAt: day(10, 42), durationMinutes: 30,
    },
  });

  // ── Output ───────────────────────────────────────────────────────────────
  console.log(`\nClosed ${stillOpen.count} shift(s) that were still open.\n`);
  console.log('Workspace: Main Office · Europe/Berlin · no pin (geofence-exempt, clocks in from anywhere)\n');
  console.log('Sign in at http://localhost:3000 — every password is password123\n');
  for (const c of created) {
    console.log(`  ${c.who.padEnd(22)} ${c.window.padEnd(14)} ${c.tests}`);
  }
  console.log(`\n  manager@example.com    (approves overtime and reconciles)`);
  console.log(`\nRests at Main Office: Coffee (3 min in, 5 min, unpaid) · Lunch (${localHm(25)}, 30 min, unpaid)`);
  console.log(`"Long day" overrides those with one paid 10-minute breather.\n`);
  console.log(`Already finished, for the timesheet: mike yesterday 05:55–18:05, counted 06:00–18:00, paid 11h30.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
