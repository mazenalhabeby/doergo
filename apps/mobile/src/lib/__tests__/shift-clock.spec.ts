/**
 * `docs/design/shift-clock.md` — the eight states, the three schedule kinds,
 * the issue flow, and every one of §9's twelve rules.
 *
 * The arithmetic is exercised directly because it is pure; the rules that are
 * about SHAPE are read out of the source, because a renderer cannot tell you
 * that exactly one disc is filled without a device.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AttendanceStatus, BreakStatus, TimeEntry } from '@hbcfield/shared/client';
import { readShiftState, scheduleFor, heroParts, budgetParts } from '../../components/home/shift-state';
import { readClockOut, AWAY_METRES } from '../../components/home/clock-out-state';
import { formatDistance } from '@hbcfield/shared/client';
import { lookFor, offeredTo, readThread, severityShown, severityTone, unreadFor, groupIssues } from '../../components/home/issue-status';
import type { ShiftIssue, ShiftIssueStatus } from '../../lib/api/shift-issues';
import { shiftCard } from './shift-card-files';
import { readSource } from '../../test-utils/read-source';

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => readSource(path.join(SRC, p), 'utf8');
/** Comments quote the things these rules forbid — strip them first. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const AT = (h: number, m = 0) => new Date(2026, 8, 24, h, m, 0, 0);

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    clockInAt: AT(6, 48).toISOString(),
    clockOutAt: null,
    location: { id: 'w1', name: 'HBC Office' },
    approvalStatus: 'PENDING',
    breakMinutes: 0,
    unpaidBreakMinutes: 0,
    ...over,
  } as unknown as TimeEntry;
}

function status(over: Partial<AttendanceStatus> = {}): AttendanceStatus {
  return { isClockedIn: false, currentEntry: null, assignedLocations: [], ...over } as AttendanceStatus;
}

const NO_BREAKS: BreakStatus = {
  isClockedIn: true, isOnBreak: false, currentBreak: null, todayBreaks: [], totalBreakMinutes: 0,
} as BreakStatus;

// ── §1 · the eight states ────────────────────────────────────────────────
describe('§1 — the eight states, and no ninth', () => {
  it('① before the shift shows the NEXT thing, never a zero', () => {
    /*
      ⚠️ A 72pt `0` is the mistake the old dashboard made with `0/12`. The
      member reads the biggest thing first; being told they have done nothing
      is not what they opened the app for.
    */
    const st = readShiftState({
      status: status({ currentEntry: entry({ expectedClockInAt: AT(7).toISOString(), expectedClockOutAt: AT(15).toISOString() }) }),
      breaks: null,
      declaredSchedule: 'FIXED',
      now: AT(6, 48),
    });
    expect(st.kind).toBe('before');
    expect(st.at?.getHours()).toBe(7);
    expect(st.minutes).toBeNull();
    expect(st.startsInMinutes).toBe(12);
  });

  it('① never draws a zero, whatever the totals say', () => {
    /*
      ⚠️ THE `0/12` BUG AGAIN. A week or month total is legitimately zero on a
      Monday morning, and drawing it renders a 64pt `0` — the exact figure §1
      forbids. With nothing worth showing the card says the sentence instead.
    */
    for (const kind of ['NONE', 'FLEXIBLE'] as const) {
      const st = readShiftState({
        status: status(), breaks: null, declaredSchedule: kind,
        monthMinutes: 0, weekMinutes: 0, monthlyHourBudget: 160, now: AT(9),
      });
      expect(st.kind).toBe('before');
      expect(st.minutes).toBeNull();
    }
    // A real total still shows.
    expect(readShiftState({ status: status(), breaks: null, declaredSchedule: 'NONE', weekMinutes: 930, now: AT(9) }).minutes).toBe(930);
  });

  it('② derives elapsed from clockInAt, not from when the screen opened', () => {
    /*
      ⚠️ RULE 5. A phone that slept through lunch must be right the INSTANT it
      wakes — a counter seeded at mount reports how long the screen has been
      open, which is a different and useless number. Proved by reading the same
      shift at two clocks with no mount in between.
    */
    const s = status({ isClockedIn: true, currentEntry: entry() });
    expect(readShiftState({ status: s, breaks: NO_BREAKS, now: AT(10) }).minutes).toBe(192);
    expect(readShiftState({ status: s, breaks: NO_BREAKS, now: AT(14) }).minutes).toBe(432);
  });

  it('③ freezes the counted figure at the moment the rest began', () => {
    /*
      ⚠️ A REST THAT SILENTLY KEEPS COUNTING is the bug the caption prevents —
      and a caption saying "not counting now" over a number that keeps creeping
      is the same bug wearing a sentence.
    */
    const breaks = {
      ...NO_BREAKS,
      isOnBreak: true,
      currentBreak: { id: 'b1', startedAt: AT(10).toISOString() },
    } as unknown as BreakStatus;
    const s = status({ isClockedIn: true, currentEntry: entry() });
    const at1030 = readShiftState({ status: s, breaks, now: AT(10, 30) });
    const at1100 = readShiftState({ status: s, breaks, now: AT(11) });
    expect(at1030.kind).toBe('resting');
    expect(at1030.countedMinutes).toBe(at1100.countedMinutes);
    // The rest's own elapsed DOES move — that is the hero.
    expect(at1100.minutes).toBeGreaterThan(at1030.minutes!);
  });

  it('④ reports the rest overdue, and keeps clocking out available', () => {
    const plan = [{
      ruleId: 'r1', name: 'Rest', dueAt: AT(11).toISOString(), expiresAt: null,
      durationMinutes: 30, isPaid: false, required: true, state: 'PENDING',
      snoozeCount: 0, snoozeMin: 5, maxSnoozes: 3,
    }];
    const st = readShiftState({
      status: status({ isClockedIn: true, currentEntry: entry({ breakPlan: plan }) }),
      breaks: NO_BREAKS,
      now: AT(11, 32),
    });
    expect(st.kind).toBe('restOverdue');
    expect(st.restOverdueBy).toBe(32);
    // ⚠️ Clock out is still one tap away — the card renders it unfilled.
    const card = shiftCard(code);
    expect(card).toMatch(/filled=\{st\.kind === 'working'\}/);
  });

  it('⑤ QUEUED is a chip on ②, not a state of its own', () => {
    const st = readShiftState({
      status: status({ isClockedIn: true, currentEntry: entry() }),
      breaks: NO_BREAKS, queued: true, now: AT(10),
    });
    expect(st.kind).toBe('working');
    expect(st.queued).toBe(true);
  });

  it('⑥ done for today is its own state, and the hero is what they EARNED', () => {
    /*
      ⚠️ ① AND ⑥ USED TO BE ONE STATE. Both are "clocked out", and collapsing
      them cost the card its answer at the two moments it is most read.
    */
    const st = readShiftState({
      status: status(),
      breaks: null,
      lastToday: entry({ clockOutAt: AT(15).toISOString(), paidMinutes: 495, approvalStatus: 'PENDING' as never }),
      now: AT(16),
    });
    expect(st.kind).toBe('done');
    expect(st.minutes).toBe(495);
    expect(st.finished?.awaitingApproval).toBe(true);
  });

  it('⑦ an open shift outranks everything, because nothing else claims it', () => {
    /*
      ⚠️ NO OTHER WIDGET IN THE CATALOGUE CLAIMS `unconfirmedClockOut`. Until
      one does it lands here — leaving it nowhere is how a shift sits
      unapprovable for a month with nothing on any screen asking.
    */
    const st = readShiftState({
      status: status({ unconfirmedClockOut: { id: 'x', clockInAt: AT(6).toISOString(), clockOutAt: AT(17).toISOString(), clockOutBasis: 'SHIFT_END', expectedClockOutAt: null, timezone: null, location: { id: 'w1', name: 'HBC Office' } } }),
      breaks: null,
      lastToday: entry({ clockOutAt: AT(15).toISOString(), paidMinutes: 495 }),
      now: AT(9),
    });
    expect(st.kind).toBe('unconfirmed');
  });

  it('⑧ is decided from an ANSWER, never from a missing one', () => {
    /*
      ⚠️ "No assigned locations" and "we have not been told yet" are the same
      empty array. Reading it before the shift had loaded made the card VANISH
      whenever the status request was slow, failed, or the member was offline —
      the clock disappearing from the home screen of somebody standing outside
      a site with no signal. Reproduced by stopping the API mid-session.
    */
    const card = shiftCard(code);
    // ⚠️ `pending` is the same absence wearing a different word.
    expect(card).toMatch(/const known = shift\.source !== 'none' && shift\.source !== 'pending';/);
    expect(card).toMatch(/if \(known && !somewhereToClockIn/);
  });

  it('shows the state the member was actually in, not one guessed from nothing', () => {
    /*
      ⚠️ THE FLASH WAS THE SAME BUG AS ⑧, ONE LINE UP: a state decided from an
      ABSENCE, because `null` means both "nothing to report" and "we have not
      been told yet".

      ⚠️ AND THE FIRST FIX WAS DEAD CODE. It remembered through the OFFLINE
      RECORDS store, which is `null` wherever the offline runtime did not
      start — every read and write through it a silent no-op. The simulator's
      app container held no offline database at all. Nothing changed, and it
      looked exactly like the bug.

      It lives in `home/remember/` now, because every widget has this shape.
    */
    const store = code('home/remember/store.ts');
    const hook = code('home/remember/use-remembered.ts');
    const shift = code('offline/attendance/use-shift.ts') + code('offline/attendance/load-shift.ts');
    const totals = code('components/home/use-schedule-totals.ts');

    // A store that exists on every build — not the offline database.
    expect(store).toMatch(/@react-native-async-storage\/async-storage/);
    // ⚠️ And the remembering itself never touches the offline database.
    expect(hook).not.toMatch(/records/);

    /*
      ⚠️ MEMORY IS READ SYNCHRONOUSLY, because a promise resolves AFTER the
      first frame is on screen — a disk-only fix still flashes.
    */
    expect(hook).toMatch(/useState<\{ data: T \| null; from: Remembered<T>\['from'\] \}>\(\(\) => \{/);
    expect(hook).toMatch(/keptNow<T>\(name, userId, rules\)/);
    // Disk is for the cold start, and only ever fills a gap.
    expect(hook).toMatch(/keptOnDisk<T>\(name, userId, rules\)/);
    expect(hook).toMatch(/prev\.from === 'pending' \?/);
    // ⚠️ A failed ask never replaces an answer with an absence.
    expect(hook).toMatch(/setState\(\(prev\) => \(prev\.from === 'pending' \? \{ data: null, from: 'none' \} : prev\)\)/);

    // ⚠️ Bounded, and answers that mean "today" are dropped when the day turns.
    expect(store).toMatch(/GOOD_FOR_MS = 18 \* 60 \* 60 \* 1000/);
    expect(store).toMatch(/rules\.sameDay && kept\.day !== localDay/);
    // ⚠️ Keyed by user, and one call forgets the lot on sign-out.
    expect(store).toMatch(/@hbcfield\/kept\/\$\{name\}\/\$\{userId\}/);
    // Every sign-out goes through endSession (lib/session/end-session.ts), and it forgets them.
    expect(code('lib/session/end-session.ts')).toMatch(/forgetEverythingKept\(\)/);

    // Both readers go through it — one implementation, not two.
    expect(shift).toMatch(/keep\(KEPT, userId, \{ status, breaks, serverAt \}\)/);
    expect(totals).toMatch(/useRemembered<ScheduleTotals>\(\{/);

    /*
      ⚠️ AND A FAILED REFRESH OF THE SHIFT MUST NOT REPLACE AN ANSWER WITH AN
      ABSENCE. `refresh` runs on every focus, so one 500 blanked the card of
      somebody who was on the clock a second earlier.
    */
    const refresh = shift.slice(shift.indexOf('const refresh = useCallback'), shift.indexOf('/* The cold start'));
    expect(refresh).toMatch(/next\.source === 'none' && prev\.source !== 'none' && prev\.source !== 'pending'/);
    expect(refresh).toMatch(/return prev;/);

    // Four sources: "not asked yet" is not "asked and nothing known".
    expect(shift).toMatch(/source: 'server' \| 'phone' \| 'none' \| 'pending'/);
  });

  it('① vs ⑥ waits for the answer that decides it', () => {
    /*
      ⚠️ THE FLASH PEOPLE ACTUALLY SEE IS THIS ONE, AND REMEMBERING THE SHIFT
      DOES NOTHING ABOUT IT. `lastToday` — a shift that ended today — comes
      from `/attendance/history`, NOT from `/attendance/status`. So the card
      could hold a complete, correct status answer and still draw ① `Ready to
      start`, then redraw as ⑥ `Done for today` when a second round trip
      landed.

      Measured on a simulator cold start, frame by frame: before, the first
      card frame read `Ready to start` and the next read `DONE FOR TODAY`.
      After, three cold starts produced no `Ready to start` frame at all.
    */
    const totals = code('components/home/use-schedule-totals.ts');
    const hook = code('home/remember/use-remembered.ts');
    const card = shiftCard(code);

    // "Nothing ended today" and "not told yet" are the same null — hence `ready`.
    expect(totals).toMatch(/interface ScheduleTotalsView extends ScheduleTotals/);
    expect(totals).toMatch(/ready: boolean/);
    expect(totals).toMatch(/ready: kept\.ready/);
    // ⚠️ Not asking IS an answer: a FIXED member on the clock fetches no history.
    expect(hook).toMatch(/ready: !enabled \|\| state\.from !== 'pending'/);
    // ⚠️ And `lastToday` means TODAY.
    expect(totals).toMatch(/sameDay: true/);

    // The card waits, and only where the choice is actually ① vs ⑥.
    expect(card).toMatch(/if \(shift\.source === 'pending'\) return null;/);
    expect(card).toMatch(/if \(!status\?\.isClockedIn && !totals\.ready\) return null;/);
  });

  it('has exactly the six kinds the states collapse to, and no more', () => {
    const src = read('components/home/shift-state.ts');
    const union = src.slice(src.indexOf('export type ShiftStateKind'), src.indexOf('export type ScheduleKind'));
    const kinds = [...union.matchAll(/\| '([a-zA-Z]+)'/g)].map((m) => m[1]).sort();
    expect(kinds).toEqual(['before', 'done', 'restOverdue', 'resting', 'unconfirmed', 'working']);
  });
});

// ── §1 · the hero is set like an amount ──────────────────────────────────
describe('§1 — the hero is set like an amount', () => {
  it('splits the integer from the unit, the way money is set', () => {
    expect(heroParts(192)).toEqual([{ value: '3', unit: 'h' }, { value: '12', unit: 'm' }]);
    expect(heroParts(42)).toEqual([{ value: '42', unit: 'm' }]);
  });
  it('pads the minutes, so 3h 05m does not read as 3h 5m', () => {
    expect(heroParts(185)[1]).toEqual({ value: '05', unit: 'm' });
  });
  it('sets a budget the same way', () => {
    expect(budgetParts(5040, 160)).toEqual([{ value: '84', unit: 'h' }, { value: '', unit: 'of 160h' }]);
  });
});

// ── §2 · three kinds of worker ───────────────────────────────────────────
describe('§2 — three kinds of worker', () => {
  it('FIXED is measured against today, FLEXIBLE against the month', () => {
    const fixed = readShiftState({
      status: status({ isClockedIn: true, currentEntry: entry({ expectedClockInAt: AT(7).toISOString(), expectedClockOutAt: AT(15).toISOString() }) }),
      breaks: NO_BREAKS, declaredSchedule: 'FIXED', now: AT(10),
    });
    expect(fixed.progress?.target).toBe(480);

    const flex = readShiftState({
      status: status({ isClockedIn: true, currentEntry: entry() }),
      breaks: NO_BREAKS, declaredSchedule: 'FLEXIBLE',
      monthlyHourBudget: 160, monthMinutes: 5220, now: AT(10),
    });
    expect(flex.progress).toEqual({ done: 5220, target: 9600 });
  });

  it('⚠️ NONE RENDERS NO PROGRESS TRACK — rule 6', () => {
    /* A bar with no target invents one, and NONE is the column's default. */
    const st = readShiftState({
      status: status({ isClockedIn: true, currentEntry: entry({ expectedClockInAt: AT(7).toISOString(), expectedClockOutAt: AT(15).toISOString() }) }),
      breaks: NO_BREAKS, declaredSchedule: 'NONE', now: AT(10),
    });
    expect(st.progress).toBeNull();
  });

  it('a FLEXIBLE member with no budget set gets no bar either', () => {
    const st = readShiftState({
      status: status({ isClockedIn: true, currentEntry: entry() }),
      breaks: NO_BREAKS, declaredSchedule: 'FLEXIBLE', monthlyHourBudget: null, monthMinutes: 5220, now: AT(10),
    });
    expect(st.progress).toBeNull();
  });

  it('an absent scheduleType reads as NONE, which is the honest default', () => {
    /*
      ⚠️ `User.scheduleType` IS NOT IN THE LOGIN PAYLOAD (§2), and `NONE` is the
      column's own default — so an unconfigured member should see the NONE
      card, a record of what they worked, and NOT a rostered day with a start
      time nobody promised them. An earlier cut inferred FIXED from a shift
      that happened to carry expectations, which is a smaller version of the
      same lie: it draws a target the member never agreed to and calls anything
      past it overtime.
    */
    expect(scheduleFor(undefined)).toBe('NONE');
    expect(scheduleFor(null)).toBe('NONE');
    expect(scheduleFor('nonsense')).toBe('NONE');
    // What the server says always wins.
    expect(scheduleFor('FLEXIBLE')).toBe('FLEXIBLE');
    expect(scheduleFor('FIXED')).toBe('FIXED');
  });

  it('the month is one request per period, not a sum on every render', () => {
    /*
      ⚠️ §2 asks for a server-side count and there is none a member can reach:
      `/attendance/reports/*` all require `canViewSpaceAttendance`. So the month
      is fetched ONCE and kept, and the component re-reads a number.
    */
    const hook = code('components/home/use-schedule-totals.ts');
    expect(hook).toMatch(/getHistory\(/);
    /*
      The asking-once guard lives in `useRemembered` now — one implementation
      for every widget, instead of each re-deriving it. The PERIOD is part of
      the question, so a phone left open across midnight re-asks on its own.
    */
    expect(hook).toMatch(/revision: `\$\{iso\(startOfMonth\(now\)\)\}\|\$\{iso\(startOfWeek\(now\)\)\}/);
    expect(code('home/remember/use-remembered.ts')).toMatch(/askedFor\.current === key/);
    // And never for somebody who will not see it.
    /*
      A FIXED member on the clock is measured against TODAY, which comes off
      the shift itself — so no totals are fetched for them at all. FLEXIBLE
      needs the month either way, and NONE needs the week both before the shift
      (the hero) and during it (the strip under the discs).
    */
    // …and none at all when the Time tab hands its own totals in.
    expect(shiftCard(code)).toMatch(/enabled: !given && \(!status\?\.isClockedIn \|\| schedule !== 'FIXED'\)/);
  });
});

// ── §9 · the twelve rules ────────────────────────────────────────────────
describe('§9 — the twelve rules', () => {
  const card = shiftCard(code);

  it('1 · one shape for all eight states', () => {
    // ONE surface, opened once and closed once. Not one per branch. (Glass or
    // well is decided by the card's place on the home — amazen CardSurface.)
    expect((card.match(/<CardSurface/g) ?? []).length).toBe(1);
    expect(card).not.toMatch(/<Well[\s>]/);
  });

  it('2 · exactly one filled disc, and in ④ it is not the obvious one', () => {
    /*
      Read as a rule rather than counted in a string: `filled` appears on the
      clock-in disc, the clock-out disc (conditioned on ② alone) and the two
      rest discs, which are mutually exclusive with each other and with ②.
    */
    expect(card).toMatch(/label=\{t\('shiftClock\.startRest'[\s\S]{0,120}filled/);
    expect(card).toMatch(/label=\{t\('shiftClock\.endRest'[\s\S]{0,120}filled/);
    expect(card).toMatch(/filled=\{st\.kind === 'working'\}/);
    /*
      ⚠️ AND CLOCKED OUT IS A PILL, NOT A ROW OF ONE. A single filled disc
      beside two quiet ones makes starting the day look like a choice among
      three; the shift has not begun, so there is exactly one thing to do.
      ⑥'s pill says `Clock in again` — the day is done, and the card is not
      arguing for another one.
    */
    expect(card).toMatch(/live \|\| resting \|\| st\.kind === 'unconfirmed' \? \(\s*<DiscRow/);
    expect(card).toMatch(/shiftClock\.clockInAgain/);
  });

  it('3 · every disc carries a label', () => {
    const discs = [...card.matchAll(/<Disc\b[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(discs.length).toBeGreaterThan(4);
    for (const d of discs) expect(d).toMatch(/\blabel=/);
  });

  it('4 · never says "paid" — in any language', () => {
    expect(card.toLowerCase()).not.toMatch(/\bpaid\b(?!Minutes)/);
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const l = JSON.parse(read(`i18n/locales/${lang}.json`));
      const blob = JSON.stringify(l.shiftClock ?? {}).toLowerCase();
      expect(blob).not.toMatch(/\bpaid\b|\bunpaid\b|\bbezahlt\b|\bpagad|\bpayé|\bpagat/);
    }
  });

  it('5 · elapsed derives from clockInAt, never a mount-time counter', () => {
    // The tick moves `now`; it does not accumulate.
    expect(card).toMatch(/const nowMs = useNow\(30_000\);\s*const now = useMemo\(\(\) => new Date\(nowMs\), \[nowMs\]\)/);
    expect(card).not.toMatch(/setElapsed|elapsed \+|\+\+/);
  });

  it('6 · NONE gets no progress bar', () => {
    // Covered by the arithmetic above; here: the card renders what it is given.
    expect(card).toMatch(/\{st\.progress \? \(/);
    expect(card).not.toMatch(/progress \?\? \{/);
  });

  it('7 · never reads /attendance/status from the response cache', () => {
    // The endpoints say so themselves (`keep: false` in the shared table); the client passes it to the cache.
    const { apiEndpoints } = require('@hbcfield/shared/client');
    expect(apiEndpoints.attendance.status.keep).toBe(false);
    expect(apiEndpoints.attendance.breakStatus.keep).toBe(false);
    // And the card goes through `useShift`, which owns the offline path.
    expect(card).toMatch(/useShift\(\)/);
    expect(card).not.toMatch(/attendanceApi\.getStatus/);
  });

  it('8 · Report\'s primary is jade, and severity is neutral below HIGH', () => {
    const form = code('components/issues/report-issue-sheet.tsx');
    /*
      ⚠️ Red means destructive. A member unsure whether to report already
      hesitates; a red button confirms the hesitation. The PRIMARY is jade —
      `critical` appears in this file only as URGENT's own colour, which is
      the one place in the scale it belongs.
    */
    const primary = form.slice(form.indexOf('issues.send'));
    expect(primary).not.toMatch(/c\.critical/);
    expect(form).toMatch(/backgroundColor: c\.accentSolid/);

    /*
      ⚠️ AND THE SCALE RUNS NEUTRAL · NEUTRAL · WARN · CRITICAL. `MEDIUM` was
      set in BLUE — a hue that appears nowhere else in this system — which
      gives the scale no shape: every row shouts something.
    */
    expect(severityTone('LOW')).toBeNull();
    expect(severityTone('MEDIUM')).toBeNull();
    expect(severityTone('HIGH')).toBe('warn');
    expect(severityTone('URGENT')).toBe('critical');
    /*
      ⚠️ AND SELECTION IS NOT COLOUR. The first cut filled the SELECTED pill
      with jade whatever it was, which put `MEDIUM` — the default nobody chose
      — in the brightest colour on the sheet.
    */
    /* Selection below HIGH is a neutral raised pill — an outline and
       full-strength ink — not the brightest colour on the sheet. */
    expect(form).toMatch(/const bg = on && hot \? fill : c\.tile;/);
    expect(form).toMatch(/const hue = severityTone\(k\);/);
    expect(severityShown('LOW')).toBe(false);
    expect(severityShown('MEDIUM')).toBe(false);
    expect(severityShown('HIGH')).toBe(true);
    expect(severityShown('URGENT')).toBe(true);
    // ⚠️ One photo button, not two.
    expect((form.match(/issues\.addPhoto/g) ?? []).length).toBe(1);
    expect(form).not.toMatch(/issues\.camera|issues\.photo'/);
  });

  it('9 · all six statuses, solid for wants-something and hollow for not', () => {
    const all: ShiftIssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELED'];
    for (const s of all) expect(lookFor(s)).toBeDefined();
    expect(lookFor('OPEN')).toMatchObject({ solid: true, tone: 'warn', open: true });
    expect(lookFor('ACKNOWLEDGED')).toMatchObject({ solid: false, tone: 'accent', open: true });
    expect(lookFor('IN_PROGRESS')).toMatchObject({ solid: true, tone: 'accent', open: true });
    expect(lookFor('RESOLVED')).toMatchObject({ solid: false, tone: 'muted', open: false });
    expect(lookFor('CLOSED')).toMatchObject({ solid: false, tone: 'muted', open: false });
    expect(lookFor('CANCELED')).toMatchObject({ solid: false, tone: 'muted', open: false });
    // Grouped by whether it is still the member's to worry about.
    const mk = (id: string, s: ShiftIssueStatus) => ({ id, status: s } as ShiftIssue);
    const { open, done } = groupIssues([mk('a', 'OPEN'), mk('b', 'RESOLVED'), mk('c', 'IN_PROGRESS')]);
    expect(open.map((i) => i.id)).toEqual(['a', 'c']);
    expect(done.map((i) => i.id)).toEqual(['b']);
  });

  it('10 · badges unread, never a total', () => {
    /*
      ⚠️ `"5 updates"` IS THE WRONG NUMBER. A thread with five of the member's
      own messages has nothing waiting in it. The question is whether anybody
      replied to *you*.
    */
    const issue = {
      id: 'i', thread: [
        { id: '1', type: 'MESSAGE', actorId: 'me', body: 'hi', at: '' },
        { id: '2', type: 'MESSAGE', actorId: 'anna', body: 'seen', at: '' },
        { id: '3', type: 'ACKNOWLEDGED', actorId: 'anna', at: '' },
      ],
    } as unknown as ShiftIssue;
    expect(unreadFor(issue, 'me')).toBe(1);
    expect(unreadFor({ id: 'x' } as ShiftIssue, 'me')).toBe(0);
    expect(code('components/issues/my-issues-sheet.tsx')).toMatch(/unreadFor\(/);
    expect(code('components/issues/my-issues-sheet.tsx')).not.toMatch(/eventCount/);
  });

  it('11 · the reporter does not Acknowledge, and cannot Resolve either', () => {
    /*
      ⚠️ ONE SHEET SERVES BOTH ROLES, so it has to know which one is looking.
      Both buttons used to appear as equal outlines whoever it was, which asks
      the person who filed a fault to acknowledge their own report.

      ⚠️ AND THE SERVER REFUSES A PLAIN REPORTER'S RESOLVE. `shift-issues.
      service.ts` allows a status change to somebody who can manage, or the
      assignee, or the reporter ONLY for CANCELED — so the link the sheet used
      to show every reporter was a 403 it swallowed. Proved against a live
      server: mike@ got 403 on RESOLVED and 200 on CANCELED.
    */
    const none = { acknowledge: false, resolve: false, withdraw: false, reopen: false, reply: true };
    const mine = { status: 'OPEN' as ShiftIssueStatus, reportedById: 'me', assignedToId: null };
    const theirs = { status: 'OPEN' as ShiftIssueStatus, reportedById: 'anna', assignedToId: null };

    // My own issue, and I can manage: resolve, never acknowledge.
    expect(offeredTo({ issue: mine, viewerId: 'me', canManage: true })).toEqual({ ...none, resolve: true });
    // Somebody else's, while OPEN: acknowledge first.
    expect(offeredTo({ issue: theirs, viewerId: 'me', canManage: true })).toEqual({ ...none, acknowledge: true });
    expect(offeredTo({ issue: { ...theirs, status: 'ACKNOWLEDGED' }, viewerId: 'me', canManage: true }))
      .toEqual({ ...none, resolve: true });

    // ⚠️ A plain reporter is offered the ending the server actually has.
    expect(offeredTo({ issue: mine, viewerId: 'me', canManage: false })).toEqual({ ...none, withdraw: true });
    // The assignee may resolve without managing anything.
    expect(offeredTo({ issue: { ...theirs, status: 'ACKNOWLEDGED', assignedToId: 'me' }, viewerId: 'me', canManage: false }))
      .toEqual({ ...none, resolve: true });
    // A bystander gets nothing but the reply.
    expect(offeredTo({ issue: theirs, viewerId: 'me', canManage: false })).toEqual(none);
    // Settled: only whoever may change status can bring it back.
    expect(offeredTo({ issue: { ...mine, status: 'RESOLVED' }, viewerId: 'me', canManage: false })).toEqual(none);
    expect(offeredTo({ issue: { ...mine, status: 'RESOLVED' }, viewerId: 'me', canManage: true }))
      .toEqual({ ...none, reopen: true });

    const thread = code('components/issues/issue-thread-sheet.tsx');
    // ⚠️ Every ending is a text link, not a button beside the reply.
    for (const key of ['issues.markResolved', 'issues.withdraw', 'issues.reopen']) {
      const at = thread.indexOf(key);
      expect(at).toBeGreaterThan(-1);
      expect(thread.slice(Math.max(0, at - 900), at)).toMatch(/alignSelf: 'center'/);
    }
    // ⚠️ No read-receipt metaphor for acknowledged/resolved.
    expect(thread).not.toMatch(/✓✓/);
    // ⚠️ The composer survives a resolve — the server never refuses a message.
    expect(thread).not.toMatch(/closedNote/);
  });

  it('11b · the trail — every event draws something', () => {
    /*
      ⚠️ THE BUBBLE RETURNED `null` FOR ANY EVENT WITH NO BODY, so the moments
      somebody actually picked the fault up were invisible and the thread had
      silent gaps in it. The web has drawn these as a centred line since the
      feature shipped.
    */
    const at = '2026-09-25T08:00:00.000Z';
    const ev = (type: string, extra: Record<string, unknown> = {}) =>
      ({ id: type, type, at, actorName: 'Anna Müller', ...extra }) as never;

    const read = readThread([
      ev('CREATED', { actorName: 'John Owner', body: 'Second rung is split.' }),
      ev('ACKNOWLEDGED'),
      ev('ASSIGNED', { metadata: { assignedToName: 'Karim Ahmad' } }),
      ev('STATUS_CHANGED', { body: 'Ladder ordered.', metadata: { toStatus: 'IN_PROGRESS' } }),
      ev('MESSAGE', { body: 'Do not use the bay ladder.' }),
      ev('RESOLVED'),
      ev('REOPENED'),
      ev('CLOSED'),
      ev('SOMETHING_NEW_FROM_A_NEWER_SERVER'),
    ]);

    // ⚠️ Nothing is dropped: nine in, nine out.
    expect(read).toHaveLength(9);
    expect(read.filter((e) => e.kind === 'note')).toHaveLength(8);

    const keys = read.map((e) => (e.kind === 'note' ? e.key : 'MESSAGE'));
    expect(keys).toEqual([
      'issues.trail.created',
      'issues.trail.acknowledged',
      'issues.trail.assigned',
      'issues.trail.started',
      'MESSAGE',
      'issues.trail.resolved',
      'issues.trail.reopened',
      'issues.trail.closed',
      // ⚠️ An unknown type still draws a line rather than a gap.
      'issues.trail.changed',
    ]);

    // ⚠️ ASSIGNED names the person it went TO, not the one who sent it.
    const assigned = read[2];
    expect(assigned.kind === 'note' && assigned.who).toBe('Karim Ahmad');
    // The reason rides its own line.
    const started = read[3];
    expect(started.kind === 'note' && started.reason).toBe('Ladder ordered.');
    // ⚠️ CREATED carries the description — the header must therefore not repeat it.
    const created = read[0];
    expect(created.kind === 'note' && created.reason).toBe('Second rung is split.');

    const sheet = code('components/issues/issue-thread-sheet.tsx');
    expect(sheet).toMatch(/readThread\(thread\)/);
    // ⚠️ The description is gone from the header — it is the first line of the trail.
    expect(sheet).not.toMatch(/\{issue\.description\}/);
    // ⚠️ A PDF is not an image.
    expect(sheet).toMatch(/startsWith\('image\/'\)/);
    // ⚠️ And the six reasons are the web's own keys, not a second list.
    expect(sheet).toMatch(/issues\.resolveReasons/);
  });

  it('11c · there is ONE modal slot, and the hand-over queues for it', () => {
    /*
      ⚠️ PROVEN FROM THE DEVICE LOG, not reasoned about. Every sheet here is a
      `<Modal>`, and on the New Architecture React Native presents each one
      from the SAME host view controller, so a second is refused outright:

          Attempt to present <RCTFabricModalHostViewController: 0x1684cd600>
            on <ExpoScreenOrientation.ScreenOrientationViewController>
            which is already presenting <RCTFabricModalHostViewController: …>.

      Three of those, matching three taps, each with its `GET /shift-issues/:id`
      in the same log — the tap fired, the request went out, and UIKit dropped
      the presentation. The member saw the list slide away and nothing arrive.

      Two wrong fixes came first: a timer (a guess at how long dismissal
      takes), then STACKING the two sheets, which is the one thing the
      platform explicitly refuses.
    */
    const sheet = code('components/blur-sheet.tsx');
    // A real slot, queued — not a delay.
    expect(sheet).toMatch(/let presenting = false/);
    expect(sheet).toMatch(/const waiting: Array<\(\) => void> = \[\]/);
    expect(sheet).toMatch(/function takeSlot/);
    expect(sheet).toMatch(/function releaseSlot/);
    /*
      ⚠️ A STUCK HOLDER FROZE EVERY SHEET. The exit unmounted only when its
      animation reported `finished`; an interrupted one left an invisible Modal
      holding the slot, and Clock out, Break, Report, My issues all became dead
      taps. It unmounts regardless now, and a waiter past STUCK_MS takes over.
    */
    expect(sheet).toMatch(/\.start\(\(\) => setMounted\(false\)\)/);
    expect(sheet).not.toMatch(/if \(finished\) setMounted\(false\)/);
    expect(sheet).toMatch(/const STUCK_MS = 1200/);
    // ⚠️ Released on UNMOUNT, never at the start of the exit animation.
    const release = sheet.slice(sheet.indexOf('if (mounted || !holds.current) return;'));
    expect(release.slice(0, 200)).toMatch(/setTimeout\(releaseSlot, SETTLE_MS\)/);
    // ⚠️ And the old guesses are gone.
    expect(sheet).not.toMatch(/dismissingUntil/);

    /*
      ⚠️ AND NOTHING INSIDE A SHEET MAY OPEN A SECOND MODAL. A photo viewer
      written as `<Modal>` beside or inside a BlurSheet is the same dead tap —
      it was live in the worklog sheet and in the issue thread's own lightbox.
    */
    const jsx = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const f of ['components/issues/issue-thread-sheet.tsx', 'components/worklog-sheet.tsx']) {
      const src = read(f);
      // `JobSheet` IS the BlurSheet slot, in the design system's clothes.
      expect(src).toMatch(/BlurSheet|JobSheet/);
      expect(jsx(src)).not.toMatch(/<Modal/);
    }
  });

  it('12 · routing stays server-side', () => {
    /*
      ⚠️ Shift issues reach the WORKSPACE'S WATCHERS, not every org admin — the
      mistake that once put the owner on every late departure. Nothing in these
      sheets may re-derive it, so nothing in them reads a roster or a role to
      decide who is told.
    */
    for (const f of [
      'components/issues/report-issue-sheet.tsx',
      'components/issues/my-issues-sheet.tsx',
      'components/issues/issue-thread-sheet.tsx',
    ]) {
      const src = code(f);
      expect(src).not.toMatch(/watchers|assignedLocations|adminsOf|routeTo/);
    }
    // The name comes from the server's own answer, or it is not said.
    expect(code('components/issues/report-issue-sheet.tsx')).toMatch(/issue\?\.assigneeName/);
  });
});

// ── §5 · Sent, and offline ───────────────────────────────────────────────
describe('§5 — Sent, a state that did not exist', () => {
  const form = code('components/issues/report-issue-sheet.tsx');

  it('lands on an acknowledgement instead of closing silently', () => {
    expect(form).toMatch(/const \[sent, setSent\]/);
    expect(form).toMatch(/if \(sent\) \{/);
    expect(form).toMatch(/issues\.sentTitle/);
  });

  it('names who has it when the server says, and never invents a name', () => {
    /* ⚠️ "Your responsible person is notified" is a promise; a name is a fact. */
    expect(form).toMatch(/issues\.sentBodyNamed/);
    expect(form).toMatch(/issues\.sentBody/);
  });

  it('offline reads Queued, on the same sheet', () => {
    /* The app is offline-first and this form gave no indication at all. */
    expect(form).toMatch(/queued: outcome\.kind !== 'done'/);
    expect(form).toMatch(/issues\.queuedTitle/);
    // Nothing to open yet — the issue is not on the server.
    expect(form).toMatch(/\{!queued \? \(/);
  });
});

// ── §8 · the two contrast bugs ───────────────────────────────────────────
describe('§8 — the two live contrast bugs', () => {
  it('the light primary never runs through accent-lift', () => {
    /*
      white on `#14a586` measures 3.11:1 and FAILS; `#087961 → #0b8168` is
      5.36:1 / 4.82:1. Every Clock out, Approve all and Send in light mode sits
      on this gradient.
    */
    /* Comments quote the failing value to explain it — strip them first. */
    const theme = code('theme/amazen.ts');
    const light = theme.slice(theme.indexOf('const LIGHT_GRADIENTS'));
    expect(light).toMatch(/primary: \['#087961', '#0b8168'\]/);
    expect(light).not.toMatch(/#14a586/);
  });

  it('ONE ground and ONE glass grey, measured over its lighter top stop', () => {
    /*
      `#9fbdb4` on glass over the ground's top stop is 4.14:1 and fails. There
      used to be a second, darker "interior" ground and a second grey for it;
      both are gone, so no screen can pair the wrong grey with its ground.
    */
    const theme = read('theme/amazen.ts');
    expect(theme).toMatch(/inkOnGlass: '#b0cbc2'/);
    expect(theme).not.toMatch(/inkOnGlassHome|interior:/);
    expect(read('components/amazen/ground.tsx')).not.toMatch(/variant/);
    expect(shiftCard(code)).toMatch(/tone="onGlass"/);
  });

  it('warn exists as its own token, and is not crit', () => {
    /* A field app has a third state that is neither paid nor declined —
       encoding it as crit makes every unapproved shift read as a failure. */
    const theme = read('theme/amazen.ts');
    expect(theme).toMatch(/warn: '#f2b263'/);
    expect(theme).toMatch(/warn: '#8a5a10'/);
  });
});

// ── the widget, as a registry row ────────────────────────────────────────
describe('the shift clock is a row', () => {
  const registry = code('home/registry.tsx');

  it('is registered, on glass, and asks the same module the tab bar asks', () => {
    expect(registry).toMatch(/key: 'shift-clock'/);
    expect(registry).toMatch(/surface: 'glass'/);
    expect(registry).toMatch(/module: 'clock'/);
    const tabs = readSource(path.resolve(SRC, 'lib/tab-layout.ts'), 'utf8');
    expect(tabs).toContain("hasAccessModule(u, 'clock')");
  });

  it('is in the default order', () => {
    expect(registry).toMatch(/DEFAULT_ORDER: string\[\] = \['shift-clock'/);
  });
});

// ── §11 · the clock-out sheet ────────────────────────────────────────────
describe('§11 — the clock-out sheet', () => {
  const sheet = code('components/clock-out-sheet.tsx');
  // The button and the Cancel line are the shared shift-sheet footer.
  const footer = code('components/sheet-confirm-footer.tsx');
  const card = shiftCard(code);

  const shift = (over: Partial<Parameters<typeof readClockOut>[0]> = {}) => ({
    workspace: 'BILLA AG',
    clockInAt: AT(6, 45),
    clockOutAt: AT(15, 0),
    restMinutes: 32,
    countedMinutes: 492,
    targetMinutes: 480,
    shiftEndAt: AT(15, 0),
    ...over,
  });

  it('1 · NOTHING BLOCKS THE BUTTON — no required field, ever', () => {
    /*
      ⚠️ THE BUG THIS EXISTS FOR. `canConfirm = notes.trim().length > 0`
      disabled both the button and the submit handler, so a member could not
      end their shift without typing a sentence — against a type whose own
      field is `notes?: string`, optional, beside an `earlyReason` documented
      as "never refuses the clock-out for want of a reason".
    */
    expect(sheet).not.toMatch(/canConfirm/);
    // The only thing that disables it is a request already in flight.
    expect(sheet).toMatch(/<SheetConfirmFooter[\s\S]*?isLoading=\{isLoading\}/);
    expect(footer).toMatch(/disabled=\{isLoading\}/);
    expect(footer.match(/disabled=/g)).toHaveLength(1);
    expect(sheet).toMatch(/if \(isLoading\) return;/);
    // And a missing GPS fix is not a failure either.
    expect(card).toMatch(/getCurrentLocation\(\)\.catch\(\(\) => null\)/);
    expect(card).not.toMatch(/if \(!fix\) return;/);
  });

  it('2 · one primary, and Cancel is a text line', () => {
    expect(sheet).toMatch(/<SheetConfirmFooter[\s\S]*?onCancel=\{close\}/);
    const notYet = footer.indexOf('shiftEnd.notYet');
    expect(notYet).toBeGreaterThan(-1);
    // No second button: the cancel has no background of its own.
    expect(footer.slice(notYet - 400, notYet)).not.toMatch(/backgroundColor/);
  });

  it('3 · jade is the primary; amber only marks a variance', () => {
    /*
      ⚠️ THE CONFIRM WAS `#d97706` — amber is the `warn` token, and it means a
      variance from the roster. Clocking out is the correct end of a shift,
      pressed every day by everybody.
    */
    expect(sheet).not.toMatch(/#d97706/);
    // The clock-out label is the footer's one button, and that button is jade.
    expect(sheet).toMatch(/<SheetConfirmFooter\s+label=\{late\s+\? t\('shiftEnd\.clockOutAndAsk'/);
    expect(footer).not.toMatch(/#d97706/);
    expect(footer).toMatch(/backgroundColor: c\.accentSolid/);
  });

  it('4 · the clock-out time is frozen at open', () => {
    /*
      A sheet left sitting on a table must not silently bill more minutes than
      the receipt showed. Holding the DATE rather than a boolean is what makes
      it impossible to get wrong — there is no `new Date()` left to re-read.
    */
    expect(sheet).not.toMatch(/new Date\(\)/);
    expect(card).toMatch(/setClockOutAt\(new Date\(\)\)/);
    expect(code('home/../components/home/clock-out-state.ts')).toMatch(/clockOutAt: Date;/);
  });

  it('5 · the hero is the card\'s own figure, in the card\'s own setting', () => {
    expect(sheet).toMatch(/import \{ heroParts \}/);
    expect(sheet).toMatch(/minutes=\{shift\.countedMinutes\}/);
    // Never the word "paid".
    expect(sheet.toLowerCase()).not.toMatch(/\bpaid\b/);
  });

  it('6 · reasons write their own columns, never `notes`', () => {
    expect(sheet).toMatch(/earlyReason: early && earlyReason/);
    expect(sheet).toMatch(/overtimeReason: late/);
    expect(sheet).toMatch(/notes: notes\.trim\(\) \|\| undefined/);
  });

  it('§11.5 — four faces, and NONE can only be ①', () => {
    expect(readClockOut(shift({ countedMinutes: 480 })).face).toBe('onTime');
    expect(readClockOut(shift({ countedMinutes: 424 })).face).toBe('early');
    expect(readClockOut(shift({ countedMinutes: 582 })).face).toBe('late');
    /*
      ⚠️ NULL TARGET IS THE WHOLE REASON ② AND ③ CANNOT HAPPEN ON `NONE`.
      Nothing is promised, so there is nothing to be early or late against — a
      target invented here would put "short of your shift" on somebody who
      never had one.
    */
    expect(readClockOut(shift({ targetMinutes: null, countedMinutes: 120 })).face).toBe('onTime');
    expect(readClockOut(shift({ targetMinutes: null, countedMinutes: 900 })).bar.over).toBe(0);
  });

  it('§11.5 — a minute either side is not a variance', () => {
    // Without a tolerance the sheet calls a shift "early" for finishing 40
    // seconds before the hour, which turns a daily act into a daily apology.
    expect(readClockOut(shift({ countedMinutes: 479 })).face).toBe('onTime');
    expect(readClockOut(shift({ countedMinutes: 481 })).face).toBe('onTime');
  });

  it('§11.5 ④ — recorded, never refused', () => {
    const away = readClockOut(shift({ awayMetres: 2400 }));
    expect(away.away).toEqual({ metres: 2400 });
    expect(readClockOut(shift({ awayMetres: AWAY_METRES - 1 })).away).toBeNull();
    // Said through the ONE distance formatter (no-break space between number and unit).
    expect(formatDistance(2400)).toBe('2.4\u00A0km');
    expect(formatDistance(380)).toBe('380\u00A0m');
    // The strip and the row flag; the BUTTON is untouched.
    expect(sheet).toMatch(/flag=\{view\.away/);
    expect(sheet).not.toMatch(/view\.away[\s\S]{0,200}disabled/);
  });

  it('§11.3 — the four strings are gone from every locale', () => {
    /*
      ⚠️ THEY APPEARED TWICE IN EACH FILE — under `home.fullTime` and again
      under `attendance`. A removal that names one leaves the other behind and
      the dead copy outlives the screen that used it.
    */
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const blob = read(`i18n/locales/${lang}.json`);
      for (const k of ['clockOutConfirmTitle', 'clockOutConfirmMessage', 'shiftNotesLabel', 'shiftNotesPlaceholder']) {
        expect(blob).not.toContain(k);
      }
      const l = JSON.parse(blob);
      for (const k of ['counted', 'clockedIn', 'rest', 'clockedOut', 'addNote', 'optional', 'notYet', 'short', 'over', 'askApproval']) {
        expect(typeof l.shiftEnd[k]).toBe('string');
      }
    }
  });

  it('§11.4 — nothing new is fetched', () => {
    expect(sheet).not.toMatch(/Api\.|fetch\(|useShift\(/);
    expect(sheet).toMatch(/shift: ClockOutShift;/);
  });
});

describe('the totals, and two silent ways they were always zero', () => {
  const hook = code('components/home/use-schedule-totals.ts');

  it('reads the BARE ARRAY the endpoint actually returns', () => {
    /*
      ⚠️ `/attendance/history` answers `{ success, data: [ … ] }` — a bare
      array once the client unwraps the envelope — whatever
      `getHistory`'s `PaginatedResponse` return type says. Reading `res.data`
      gave `undefined` on every call, so every figure was 0 and ⑥ could never
      appear: a 200, no error, and a card quietly saying nothing happened
      today. Found by calling the endpoint directly.
    */
    expect(hook).toMatch(/Array\.isArray\(res\)/);
    expect(code('lib/api/attendance.ts')).toMatch(/getHistory/);
  });

  it('asks for the member\'s own calendar days, not UTC ones', () => {
    /*
      ⚠️ `toISOString().slice(0,10)` IS A UTC DATE. Local midnight on the 1st
      in UTC+2 is `2026-08-31T22:00Z`, so the month asked for started on 31
      August and the week on the 20th — an off-by-one on every boundary,
      invisible in London and wrong everywhere else.
    */
    expect(hook).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
    expect(hook).toMatch(/localDateKey\(d\)/);
  });

  it('a cancelled run forgets it asked', () => {
    /*
      React 18 mounts an effect twice in development: the first run claims the
      key and starts the fetch, the cleanup marks it stale, and the second run
      sees its own key already claimed and returns. The answer is then
      discarded for being stale and no second one is ever asked for.

      It is `useRemembered`'s job now, so every widget gets it.
    */
    expect(code('home/remember/use-remembered.ts'))
      .toMatch(/if \(!alive && askedFor\.current === key\) askedFor\.current = '';/);
  });

  it('leaves no console logging behind', () => {
    expect(hook).not.toMatch(/console\./);
  });
});

describe('one clock for the whole feature', () => {
  it('no surface formats a time itself', () => {
    /*
      ⚠️ THE SAME SHIFT READ `9:04 AM` ON ONE PHONE AND `09:43` ON ANOTHER.
      `toLocaleTimeString` asks the DEVICE, so the card ignored both the
      member's own 12h/24h choice — which follows them across devices — and the
      organization's timezone, which every other attendance surface honours.
      `useTimeFormat` exists so "screens never hardcode 12h/24h".

      ⚠️ AND THE ZONE MATTERS MORE THAN THE FORMAT: converting to the device's
      zone makes a night shift clocked at 23:50 read as tomorrow to somebody
      who travelled.
    */
    for (const src of [
      shiftCard(code),
      code('components/clock-out-sheet.tsx'),
      code('components/issues/issue-thread-sheet.tsx'),
    ]) {
      expect(src).not.toMatch(/toLocaleTimeString/);
      expect(src).toMatch(/clockOf/);
    }
    expect(shiftCard(code)).toMatch(/useTimeFormat\(\)\.formatTime/);
  });
});

describe('the Break disc asks which kind, and never insists', () => {
  const sheet = code('components/break-sheet.tsx');
  const card = shiftCard(code);

  it('offers the three, and the button works with none picked', () => {
    /*
      ⚠️ AN OFFER, NOT A GATE. With nothing selected this is exactly what the
      disc did before the sheet existed: no `type`, and the server satisfies
      whichever planned rest is next — its own comment says "guessing beats
      refusing, the alternative is a prompt they cannot answer".
    */
    expect(sheet).toMatch(/BreakType\.LUNCH, BreakType\.SHORT, BreakType\.OTHER/);
    expect(sheet).toMatch(/type: kind \?\? undefined/);
    // The footer's button is disabled only while a request is in flight.
    expect(sheet).toMatch(/<SheetConfirmFooter[\s\S]*?isLoading=\{isLoading\}/);
    expect(sheet).not.toMatch(/disabled=\{!kind/);
  });

  it('uses the shared enum, not a second list of the same three names', () => {
    // A local copy is a fourth kind waiting to be added on one side only.
    expect(sheet).toMatch(/from '@hbcfield\/shared\/client'/);
    expect(sheet).not.toMatch(/'LUNCH' \| 'SHORT' \| 'OTHER'/);
  });

  it('the reason appears only on Other, and is optional', () => {
    expect(sheet).toMatch(/\{kind === BreakType\.OTHER \? \(/);
    expect(sheet).toMatch(/kind === BreakType\.OTHER && reason\.trim\(\)/);
    // A field that gated the button would be the clock-out bug in miniature.
    expect(sheet).not.toMatch(/reason\.trim\(\)[^;]*disabled/);
  });

  it('all three chips stay neutral', () => {
    /* None of them is a variance and none is a warning — a coloured pill here
       would say one break is worse than another. */
    expect(sheet).not.toMatch(/c\.warn|c\.critical|c\.accentSolid,\s*\n\s*borderWidth/);
    expect(sheet).toMatch(/borderColor: on \? c\.inkStrong : 'transparent'/);
  });

  it('④ does not go through the sheet', () => {
    /*
      ⚠️ A rest that is already late has one answer — take it — and naming its
      `ruleId` is what marks the plan satisfied rather than adding a second
      rest beside the one that is due. Asking "what kind?" there is a question
      about a decision already made.
    */
    expect(card).toMatch(/onPress=\{\(\) => void startRest\(\{ ruleId: st\.nextRest\?\.ruleId \}\)\}/);
    expect(card).toMatch(/onPress=\{\(\) => setBreakOpen\(true\)\}/);
  });

  it('says what the rest IS, rather than asking the member to price it', () => {
    /*
      ⚠️ The type is a LABEL, not a price: the server copies `isPaid` from the
      planned rest it matches, never from `type`. So the sheet states the
      duration and whether it counts, and the choice stays cosmetic.
    */
    expect(sheet).toMatch(/planned\.isPaid/);
    expect(sheet).toMatch(/shiftClock\.restDoesNotCount/);
    expect(sheet).toMatch(/planned=\{st\.nextRest\}|planned\?/);
  });

  it('has its copy in every language', () => {
    for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
      const l = JSON.parse(read(`i18n/locales/${lang}.json`));
      for (const k of ['whatKind', 'startBreak', 'breakReason', 'restCounts', 'restDoesNotCount']) {
        expect(typeof l.shiftClock[k]).toBe('string');
      }
      for (const k of ['lunch', 'short', 'other', 'takeABreak']) {
        expect(typeof l.attendance.breaks[k]).toBe('string');
      }
    }
  });
});
