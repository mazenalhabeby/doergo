/**
 * The ten-day job — the story the "Time in HBCField" explainer is built on.
 *
 * ONE job, "Boiler room replacement" at Pilgrove Hotels: Tobias Okafor works
 * it for four days (a part goes missing on day 3, his phone dies at the end of
 * day 4 so no handover note is written), Mara Kellner hands it to Priya Rhodes
 * on day 5, and Priya finishes it on day 10.
 *
 * The narration reads numbers off this job, so the data has to MAKE them:
 * every move is a real status event at a real minute, every day a real shift
 * with a real rest, every overnight a real pause. The job page, the clock-out
 * sheet and Reports → Job time then compute exactly what the voice says.
 *
 * ⚠️ FIVE SNAPSHOTS OF THE SAME JOB (`VIDEO_STORY` env), because the camera has
 * to see it at different moments and "now" is when the capture runs:
 *   start        day 1 is today; accepted last night; Tobias not clocked in
 *   office       as start, but Tobias IS clocked in (the office starts it for him)
 *   live         day 4 is today; Tobias on the clock, working, no rest yet
 *   nextmorning  day 2 is today; day 1 ended with no note; Tobias just clocked in
 *   handover     day 5 is today; Tobias off sick, owes the note; Priya clocked in
 *   done         all ten days are in the past; completed on day 10
 * Today's times are RELATIVE to now (the capture may run at any hour); past
 * days use the story's own clock (07:00 in, 15:30 out, London time).
 */

import type { PrismaClient } from '@prisma/client';
import { DEPOT, ORG_TIMEZONE } from './demo-data.ts';

export type StoryState = 'start' | 'office' | 'live' | 'nextmorning' | 'handover' | 'done';
/** VIDEO_LANG=de writes the job's own words in German, for the German film. */
const DE = process.env.VIDEO_LANG === 'de';
const TEXT = DE
  ? {
      title: 'Austausch Heizraum',
      description: 'Die zwei alten Gaskessel im Heizraum im Keller ausbauen und das neue Brennwert-Paar mit Pumpen und Druckhaltung einbauen. Das Hotel bleibt offen: jeden Abend wieder Warmwasser.',
      address: 'Lindenallee 40, 4020 Linz',
      blocked: 'Pumpenflansch-Satz fehlt — bestellt, kommt um 11:15',
      note: 'Alte Kessel raus, neues Paar montiert und an den Kamin angeschlossen. Linker Kreis noch offen, Druckprobe nicht gemacht. Flansch-Satz liegt im Heizraum.',
      noteShort: 'Alte Kessel raus, neues Paar montiert…',
    }
  : {
      title: 'Boiler room replacement',
      description: TEXT.description,
      address: '40 Marchmont Street, Reading RG1',
      blocked: 'Pump flange kit missing — ordered, arrives 11:15',
      note: TEXT.note,
      noteShort: 'Old boilers out, new pair mounted and flued…',
    };
export const STORY_TITLE = TEXT.title;
export const STORY_CLIENT = 'Pilgrove Hotels';

const MIN = 60_000;

/** The UTC instant for a wall-clock time in the org's zone on a given calendar day. */
function local(day: Date, hh: number, mm = 0): Date {
  const guess = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm));
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: ORG_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess);
  const shownH = Number(parts.find((p) => p.type === 'hour')!.value);
  const shownM = Number(parts.find((p) => p.type === 'minute')!.value);
  const offset = (shownH * 60 + shownM) - (hh * 60 + mm);
  return new Date(guess.getTime() - offset * MIN);
}

/** The last `n` weekdays strictly before today, oldest first. */
function pastWeekdays(n: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(new Date(d));
  }
  return out;
}

type Ev = { type: 'STATUS_CHANGED' | 'PAUSED' | 'RESUMED' | 'ASSIGNED' | 'UNASSIGNED' | 'HANDOVER_ADDED'; by: string; at: Date; meta?: Record<string, unknown> };
type Shift = { userId: string; in: Date; out: Date | null; rest?: [Date, Date] };

export async function seedTenDayJob(
  prisma: PrismaClient,
  args: {
    orgId: string;
    spaceId: string;
    workflowId: string;
    leadId: string;
    crew: Record<string, { id: string }>;
    clientIds: Map<string, string>;
    state: StoryState;
  },
): Promise<{ taskId: string; state: StoryState }> {
  const { orgId, spaceId, workflowId, leadId, crew, clientIds, state } = args;
  const tobias = crew.okafor!.id;
  const priya = crew.rhodes!.id;
  const now = new Date();

  /*
    Their other demo jobs carry no history, but one of Tobias's stands "in
    progress" — the clock-out sheet would list it beside ours, and the board's
    "one job at a time" would refuse our job. Handed to a colleague for the story.
  */
  await prisma.task.updateMany({
    where: { organizationId: orgId, assignedToId: { in: [tobias, priya] }, title: { not: STORY_TITLE }, status: { in: ['IN_PROGRESS', 'EN_ROUTE', 'ARRIVED'] } },
    data: { assignedToId: crew.brennan!.id },
  });

  // How many story days are behind us, and what today is in the story.
  const pastCount = { start: 0, office: 0, live: 3, nextmorning: 1, handover: 4, done: 10 }[state];
  const days = pastWeekdays(pastCount);

  const events: Ev[] = [];
  const shifts: Shift[] = [];
  const created = local(days[0] ?? now, 6, 10);
  const dayBefore = new Date((days[0] ?? now).getTime() - 86_400_000);
  events.push({ type: 'ASSIGNED', by: leadId, at: local(dayBefore, 16, 20), meta: { assignedTo: 'Tobias Okafor' } });
  events.push({ type: 'STATUS_CHANGED', by: tobias, at: local(dayBefore, 18, 40), meta: { oldStatus: 'ASSIGNED', newStatus: 'ACCEPTED' } });

  /** One normal past day for a worker: 07:00 in, rest 12:00–12:30, 15:30 out, paused at the clock-out. */
  const pastDay = (d: Date, who: string, n: number, opts: { first?: boolean; blocked?: boolean; complete?: boolean; noNote?: boolean; inAt?: [number, number]; outAt?: [number, number]; rest?: [number, number] } = {}) => {
    const [ih, im] = opts.inAt ?? [7, 0];
    const [oh, om] = opts.outAt ?? [15, 30];
    const [rh, rm] = opts.rest ?? [12, 0];
    const restStart = local(d, rh, rm);
    shifts.push({ userId: who, in: local(d, ih, im), out: local(d, oh, om), rest: [restStart, new Date(restStart.getTime() + 30 * MIN)] });
    if (opts.first) {
      events.push({ type: 'STATUS_CHANGED', by: who, at: local(d, 7, 5), meta: { oldStatus: 'ACCEPTED', newStatus: 'EN_ROUTE' } });
      events.push({ type: 'STATUS_CHANGED', by: who, at: local(d, 7, 35), meta: { oldStatus: 'EN_ROUTE', newStatus: 'ARRIVED' } });
      events.push({ type: 'STATUS_CHANGED', by: who, at: local(d, 7, 36), meta: { oldStatus: 'ARRIVED', newStatus: 'IN_PROGRESS' } });
    } else {
      const startH = ih === 7 ? 7 : ih;
      const startM = ih === 7 ? 35 : im + 45;
      events.push({ type: 'RESUMED', by: who, at: local(d, startH, startM) });
    }
    if (opts.blocked) {
      events.push({ type: 'STATUS_CHANGED', by: who, at: local(d, 10, 0), meta: { oldStatus: 'IN_PROGRESS', newStatus: 'BLOCKED', reason: TEXT.blocked } });
      events.push({ type: 'STATUS_CHANGED', by: who, at: local(d, 11, 20), meta: { oldStatus: 'BLOCKED', newStatus: 'IN_PROGRESS' } });
    }
    if (opts.complete) {
      events.push({ type: 'STATUS_CHANGED', by: who, at: local(d, 12, 35), meta: { oldStatus: 'IN_PROGRESS', newStatus: 'COMPLETED' } });
      return;
    }
    // What a real clock-out records: the worker's time on the job so far (JobPauseService).
    const workedSoFar = who === tobias ? [445, 890, 1255, 1700][n - 1] : undefined;
    events.push({ type: 'PAUSED', by: who, at: local(d, oh, om), meta: { reason: opts.noNote ? 'AUTO_CLOSE' : 'CLOCK_OUT', at: local(d, oh, om).toISOString(), ...(workedSoFar ? { workedMinutes: workedSoFar } : {}) } });
  };

  // ── The days behind us ──
  const story: Array<() => void> = [
    () => pastDay(days[0]!, tobias, 1, { first: true }),
    () => pastDay(days[1]!, tobias, 2),
    () => pastDay(days[2]!, tobias, 3, { blocked: true }),
    () => pastDay(days[3]!, tobias, 4, { noNote: true }),
    () => {
      // What the real reassign writes: the old worker off, the new one on (TasksService.assign).
      events.push({ type: 'UNASSIGNED', by: leadId, at: local(days[4]!, 8, 30), meta: { previousWorkerId: tobias } });
      events.push({ type: 'ASSIGNED', by: leadId, at: new Date(local(days[4]!, 8, 30).getTime() + 1000), meta: { workerId: priya, workerName: 'Priya Rhodes' } });
      pastDay(days[4]!, priya, 5, { inAt: [9, 0], outAt: [16, 30], rest: [12, 30] });
    },
    () => pastDay(days[5]!, priya, 6),
    () => pastDay(days[6]!, priya, 7),
    () => pastDay(days[7]!, priya, 8),
    () => pastDay(days[8]!, priya, 9),
    () => pastDay(days[9]!, priya, 10, { complete: true }),
  ];
  for (let i = 0; i < pastCount; i += 1) story[i]!();

  // ── Today ──
  let status = 'ACCEPTED';
  let assignedToId = tobias;
  let pausedAt: Date | null = null;
  let pausedById: string | null = null;
  let handoverDueById: string | null = null;
  const openShifts: Shift[] = [];
  if (state === 'office') {
    openShifts.push({ userId: tobias, in: new Date(now.getTime() - 64 * MIN), out: null });
  } else if (state === 'live') {
    // Day 4: on the clock 3h18m, back on the job since 2h43m ago.
    status = 'IN_PROGRESS';
    openShifts.push({ userId: tobias, in: new Date(now.getTime() - 198 * MIN), out: null });
    events.push({ type: 'RESUMED', by: tobias, at: new Date(now.getTime() - 163 * MIN) });
  } else if (state === 'nextmorning') {
    // Day 1 ended without a note; Tobias has just clocked in for day 2.
    status = 'IN_PROGRESS';
    const last = events.filter((e) => e.type === 'PAUSED').pop()!;
    last.meta = { ...last.meta, reason: 'AUTO_CLOSE' };
    pausedAt = last.at; pausedById = tobias; handoverDueById = tobias;
    openShifts.push({ userId: tobias, in: new Date(now.getTime() - 4 * MIN), out: null });
  } else if (state === 'handover') {
    // Day 5 morning: Tobias off sick, his note still owed; Priya on the clock, the job still his.
    status = 'IN_PROGRESS';
    const last = events.filter((e) => e.type === 'PAUSED').pop()!;
    pausedAt = last.at; pausedById = tobias; handoverDueById = tobias;
    openShifts.push({ userId: priya, in: new Date(now.getTime() - 25 * MIN), out: null });
  } else if (state === 'done') {
    status = 'COMPLETED';
    assignedToId = priya;
  } else if (state === 'live' || pastCount > 0) {
    status = 'IN_PROGRESS';
  }

  // ── Write it ──
  const task = await prisma.task.create({
    data: {
      organizationId: orgId,
      spaceId,
      workflowId,
      createdById: leadId,
      assignedToId,
      customerId: clientIds.get(STORY_CLIENT) ?? null,
      title: STORY_TITLE,
      description: TEXT.description,
      status,
      priority: 'HIGH' as never,
      dueDate: local(days[days.length - 1] ?? now, 17, 0),
      locationAddress: TEXT.address,
      pausedAt,
      pausedById,
      handoverDueById,
      createdAt: created,
    },
    select: { id: true },
  });
  await prisma.taskEvent.create({ data: { taskId: task.id, userId: leadId, eventType: 'CREATED' as never, metadata: { title: STORY_TITLE } as never, createdAt: local(dayBefore, 16, 15) } });
  for (const e of events.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId: e.by,
        eventType: e.type as never,
        // `occurredAt` / `at` is the moment job time reads; createdAt keeps the panel's order.
        metadata: { ...(e.meta ?? {}), ...(e.type === 'STATUS_CHANGED' ? { occurredAt: e.at.toISOString() } : { at: e.at.toISOString() }) } as never,
        createdAt: e.at,
      },
    });
  }
  if (state === 'done') {
    // Tobias wrote his note from home on day 5; it is on the job.
    const at = local(days[4]!, 10, 10);
    const h = await prisma.taskHandover.create({
      data: {
        organizationId: orgId, taskId: task.id, authorId: tobias, workedMinutes: 28 * 60 + 20, createdAt: at,
        note: TEXT.note,
      },
      select: { id: true },
    });
    await prisma.taskEvent.create({ data: { taskId: task.id, userId: tobias, eventType: 'HANDOVER_ADDED' as never, metadata: { handoverId: h.id, content: TEXT.noteShort } as never, createdAt: at } });
  }
  if (assignedToId === priya) {
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: priya, role: 'LEAD' as never } }).catch(() => undefined);
  }

  // ── Their shifts on the story days replace the generic history for those days ──
  const allShifts = [...shifts, ...openShifts];
  for (const who of [tobias, priya]) {
    const mine = allShifts.filter((s) => s.userId === who);
    for (const s of mine) {
      const dayStart = local(s.in, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      await prisma.timeEntry.deleteMany({ where: { organizationId: orgId, userId: who, clockInAt: { gte: dayStart, lt: dayEnd } } });
    }
  }
  // Nobody in the story may be on the clock unless the snapshot says so.
  await prisma.timeEntry.updateMany({ where: { organizationId: orgId, userId: { in: [tobias, priya] }, status: 'CLOCKED_IN' }, data: { status: 'CLOCKED_OUT', clockOutAt: now } });
  for (const s of allShifts) {
    const restMin = s.rest ? Math.round((s.rest[1].getTime() - s.rest[0].getTime()) / MIN) : 0;
    const total = s.out ? Math.round((s.out.getTime() - s.in.getTime()) / MIN) : null;
    const entry = await prisma.timeEntry.create({
      data: {
        organizationId: orgId,
        userId: s.userId,
        locationId: spaceId,
        status: s.out ? 'CLOCKED_OUT' : 'CLOCKED_IN',
        timezone: ORG_TIMEZONE,
        clockInAt: s.in,
        clockOutAt: s.out,
        clockInLat: DEPOT.lat,
        clockInLng: DEPOT.lng,
        clockInAccuracy: 8,
        ...(s.out ? { clockOutLat: DEPOT.lat, clockOutLng: DEPOT.lng, clockOutAccuracy: 9 } : {}),
        totalMinutes: total,
        breakMinutes: restMin,
        unpaidBreakMinutes: restMin,
        paidMinutes: total != null ? total - restMin : null,
        approvalStatus: 'APPROVED',
        clockInWithinGeofence: true,
      },
      select: { id: true },
    });
    if (s.rest) {
      await prisma.break.create({
        data: { timeEntryId: entry.id, type: 'LUNCH' as never, startedAt: s.rest[0], endedAt: s.rest[1], durationMinutes: restMin, isPaid: false },
      });
    }
  }
  return { taskId: task.id, state };
}
