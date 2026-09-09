/**
 * Cover: will there be enough people, and are they the right people?
 *
 * One rule, in one place, because four surfaces ask it and any two of them
 * disagreeing is worse than none of them asking: the leave wallchart's footer,
 * the verdict on a pending request, the "on the floor right now" panel, and the
 * warning a member sees when they ask for days.
 *
 * Everything here is PURE. The caller fetches rosters and leave; this decides.
 * That split is what lets the server compute a verdict for a hundred requests
 * from two queries, and lets a test state a scenario in six lines.
 *
 * The counterfactual is the point. `coverOn` takes an optional leave record to
 * treat as already approved, so "how many are on the floor" and "how many WOULD
 * be if I approved this" are the same function with one argument different —
 * they cannot drift into two answers.
 */

/** A date as the rota means it: a local calendar day, no clock, no zone. */
export type DateKey = string; // YYYY-MM-DD

/** 0 = Sunday … 6 = Saturday, matching JavaScript and `TechnicianSchedule`. */
export type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * One rota assignment as this rule needs to see it — the shape of
 * `ShiftAssignment` minus everything about times, breaks and reminders.
 */
export interface CoverShiftRule {
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONE_OFF';
  daysOfWeek: number[];
  daysOfMonth: number[];
  /** ONE_OFF dates, already reduced to date keys by the caller. */
  dates: DateKey[];
  effectiveFrom: DateKey;
  effectiveTo: DateKey | null;
}

/** One person, and everything that decides whether they are on the floor. */
export interface CoverPerson {
  id: string;
  firstName: string;
  lastName: string;
  spaceId: string;
  /** What they can actually do. Cover is not fungible — see `assessLeave`. */
  specialty: string | null;
  position: string | null;
  /** Days they hold an ACTIVE `TechnicianSchedule` row for. */
  scheduleDows: number[];
  /**
   * Their scheduled start ("HH:MM") per weekday, when a weekly schedule sets
   * one. Only the live floor panel reads it — cover itself does not care what
   * time somebody starts, only whether they are expected at all.
   */
  startByDow?: Record<number, string>;
  /** Their rota assignments in this space. */
  shiftRules: CoverShiftRule[];
}

/** One leave record, reduced to what cover cares about. */
export interface CoverLeave {
  id: string;
  personId: string;
  from: DateKey;
  to: DateKey;
}

/** A workspace and the staffing floor it must not fall below. */
export interface CoverSpace {
  id: string;
  name: string;
  /** 0 = no floor set. Never treat 0 as "nobody needed" — treat it as unset. */
  minCover: number;
}

/**
 * What this person actually DOES — the thing cover is not fungible in.
 *
 * ⚠️ `specialty` is the field the product was designed around and is empty in
 * practice: on a real organization it is NULL for every member, while
 * `position` carries the trade ("Electrician", "HVAC Specialist", "Plumber").
 * Reading `specialty` alone meant the skill-gap verdict could never fire on real
 * data — the one case a headcount cannot see, silently disabled. So: specialty
 * when somebody filled it in, position otherwise.
 *
 * Compared case-insensitively and trimmed, because these are free text a human
 * typed twice.
 */
export function tradeOf(p: Pick<CoverPerson, 'specialty' | 'position'>): string | null {
  const raw = (p.specialty ?? p.position ?? '').trim();
  return raw ? raw : null;
}

/** Do two people cover for each other's trade? */
export function sameTrade(a: CoverPerson, b: CoverPerson): boolean {
  const x = tradeOf(a), y = tradeOf(b);
  return !!x && !!y && x.toLowerCase() === y.toLowerCase();
}

/** Does this leave record cover this day? Inclusive at both ends. */
export function leaveCovers(l: Pick<CoverLeave, 'from' | 'to'>, day: DateKey): boolean {
  return day >= l.from && day <= l.to;
}

/** The weekday of a date key, without constructing a zoned Date. */
export function dowOf(day: DateKey): Dow {
  const [y, m, d] = day.split('-').map(Number);
  // UTC on purpose: a date key has no zone, and going through local time makes
  // the weekday depend on where the server happens to run.
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() as Dow;
}

/** Day-of-month, same reasoning. */
function domOf(day: DateKey): number {
  return Number(day.slice(8, 10));
}

/**
 * Is this rota rule in force on this day at all?
 *
 * Separate from whether it puts them AT WORK, and the distinction is
 * load-bearing — see `isRosteredOn`. A rota starting next month says nothing
 * whatsoever about today.
 */
function shiftRuleInForce(r: CoverShiftRule, day: DateKey): boolean {
  if (day < r.effectiveFrom) return false;
  if (r.effectiveTo && day > r.effectiveTo) return false;
  return true;
}

/** Does one rota rule put this person at work on this day? */
function shiftRuleMatches(r: CoverShiftRule, day: DateKey): boolean {
  if (!shiftRuleInForce(r, day)) return false;
  switch (r.recurrence) {
    case 'DAILY':
      return true;
    case 'WEEKLY':
      return r.daysOfWeek.includes(dowOf(day));
    case 'MONTHLY':
      return r.daysOfMonth.includes(domOf(day));
    case 'ONE_OFF':
      return r.dates.includes(day);
    default:
      return false;
  }
}

/**
 * Is this person expected at work on this day?
 *
 * Asked PER DAY, and the precedence is per day too:
 *
 *   • a rota rule puts them at work that day            → yes
 *   • a rota GOVERNS that day but excludes it           → no
 *   • no rota reaches that day, but a week is set       → the week decides
 *   • nothing is configured at all                      → yes, every day
 *
 * ⚠️ The second and third branches were once one. "Has any rota at all → the
 * weekly schedule is irrelevant" reads fine and is wrong: a rota starting next
 * month, or one that ended in March, would blank out a working week that is
 * genuinely in force on the day being asked about. Found on real data — a
 * member with a Mon–Fri week and a rota effective from 5 September had an
 * August leave request assessed over ZERO days, so it silently got no verdict.
 * Being governed by a rota is a fact about a DAY, not about a person.
 *
 * The last branch is deliberate too. Most organizations never fill in a working
 * week, and treating "we were never told" as "they are off" would report zero
 * cover everywhere and make the whole feature lie. Counting them means a day off
 * still shows as one fewer person, which is the thing being measured; the
 * surfaces label such a workspace so nobody reads the number as a rota.
 * `hasRota` exists so they can.
 */
export function isRosteredOn(p: CoverPerson, day: DateKey): boolean {
  let governed = false;
  for (const r of p.shiftRules) {
    if (shiftRuleMatches(r, day)) return true;
    if (shiftRuleInForce(r, day)) governed = true;
  }
  if (governed) return false;
  if (p.scheduleDows.length > 0) return p.scheduleDows.includes(dowOf(day));
  return true;
}

/** Does this person have any rota at all, or are we counting heads? */
export function hasRota(p: CoverPerson): boolean {
  return p.shiftRules.length > 0 || p.scheduleDows.length > 0;
}

export interface DayCover {
  day: DateKey;
  /** Everyone expected at work that day, before leave. */
  rostered: CoverPerson[];
  /** Rostered, minus anyone on leave. */
  working: CoverPerson[];
  /** Rostered but away. */
  away: CoverPerson[];
}

/**
 * Who is on the floor in one workspace on one day.
 *
 * `treatAsOff` answers the counterfactual — "and if this request were approved?"
 * — through the same code path as the present tense, which is the only way the
 * chart footer and the approval drawer can be guaranteed to agree.
 */
export function coverOn(
  roster: CoverPerson[],
  approvedLeave: CoverLeave[],
  day: DateKey,
  treatAsOff?: CoverLeave | null,
): DayCover {
  const rostered = roster.filter((p) => isRosteredOn(p, day));
  const awayIds = new Set<string>();
  for (const l of approvedLeave) if (leaveCovers(l, day)) awayIds.add(l.personId);
  if (treatAsOff && leaveCovers(treatAsOff, day)) awayIds.add(treatAsOff.personId);
  return {
    day,
    rostered,
    working: rostered.filter((p) => !awayIds.has(p.id)),
    away: rostered.filter((p) => awayIds.has(p.id)),
  };
}

/** Every date key from `from` to `to`, inclusive. Bounded by the caller. */
export function eachDay(from: DateKey, to: DateKey, max = 366): DateKey[] {
  const out: DateKey[] = [];
  const [y, m, d] = from.split('-').map(Number);
  const cur = new Date(Date.UTC(y!, m! - 1, d!));
  for (let i = 0; i < max; i++) {
    const k = cur.toISOString().slice(0, 10);
    if (k > to) break;
    out.push(k);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export type CoverLevel = 'ok' | 'tight' | 'short' | 'skill';

/** One day of a request, and what approving it would do to that day. */
export interface CoverDay {
  day: DateKey;
  /** On the floor as things stand. */
  now: number;
  /** On the floor if this request were approved. */
  then: number;
  /** Would `then` fall under the workspace's floor? */
  breach: boolean;
  /** Would nobody left share this person's trade? */
  skillGap: boolean;
  /** Who would be left, and who is already away. Names, for the drawer. */
  working: CoverPerson[];
  away: CoverPerson[];
}

export interface CoverAssessment {
  level: CoverLevel;
  /** Days the request actually costs cover — rest days are skipped. */
  days: CoverDay[];
  /** The thinnest day, after approving. */
  worst: number;
  floor: number;
  breachDays: number;
  skillGapDays: number;
  /** The trade left uncovered, when `level` is 'skill'. */
  skill: string | null;
  /** False when the workspace has no rota at all — the count is headcount. */
  rotaKnown: boolean;
}

/**
 * What would approving this request do?
 *
 * Order is the argument: a missing TRADE outranks a thin HEADCOUNT, because two
 * electricians do not cover an absent plumber and a count alone reports that
 * situation as fine. This is the case a general-purpose leave tool cannot see
 * and this product can, since it already knows what each member does.
 *
 * A day the person was not rostered anyway costs nothing and is left out
 * entirely — counting a weekend as "cover lost" is how a warning becomes noise.
 */
export function assessLeave(
  request: CoverLeave & { personId: string },
  person: CoverPerson,
  space: CoverSpace,
  roster: CoverPerson[],
  approvedLeave: CoverLeave[],
): CoverAssessment {
  const floor = space.minCover;
  const days: CoverDay[] = [];
  let worst = Number.POSITIVE_INFINITY;
  let breachDays = 0;
  let skillGapDays = 0;

  // Never let this request count itself twice — an already-approved copy in the
  // list would make the projection look one person worse than it is.
  const others = approvedLeave.filter((l) => l.id !== request.id);

  for (const day of eachDay(request.from, request.to)) {
    if (!isRosteredOn(person, day)) continue;
    const now = coverOn(roster, others, day);
    const then = coverOn(roster, others, day, request);
    const n = then.working.length;
    const breach = floor > 0 && n < floor;
    // Nobody left who does what they do. Read through `tradeOf`, so a member
    // whose trade lives in `position` is judged like everybody else.
    const skillGap = !!tradeOf(person) && !then.working.some((p) => sameTrade(p, person));
    if (breach) breachDays++;
    if (skillGap) skillGapDays++;
    worst = Math.min(worst, n);
    days.push({
      day,
      now: now.working.length,
      then: n,
      breach,
      skillGap,
      working: then.working,
      away: now.away,
    });
  }

  if (!days.length) worst = 0;

  const level: CoverLevel = skillGapDays > 0
    ? 'skill'
    : breachDays > 0
      ? 'short'
      : floor > 0 && worst === floor
        ? 'tight'
        : 'ok';

  return {
    level,
    days,
    worst,
    floor,
    breachDays,
    skillGapDays,
    skill: skillGapDays > 0 ? tradeOf(person) : null,
    rotaKnown: roster.some(hasRota),
  };
}

/**
 * The one-line verdict, written once so the chart badge, the drawer heading and
 * the mobile list read identically. Returned as parts rather than a sentence so
 * each surface can translate it — the server never ships English to a screen.
 */
export interface CoverVerdict {
  level: CoverLevel;
  worst: number;
  floor: number;
  breachDays: number;
  skillGapDays: number;
  skill: string | null;
  rotaKnown: boolean;
}

/**
 * One name, as a screen needs it. `CoverPerson` carries the rota rules, which
 * are neither useful to a browser nor anybody's business outside the server —
 * so what crosses the wire is this.
 */
export interface CoverName {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
}

/** One day of a request, reduced for the wire. */
export interface CoverDayBrief {
  day: DateKey;
  now: number;
  then: number;
  breach: boolean;
  skillGap: boolean;
  working: CoverName[];
  away: CoverName[];
}

const brief = (p: CoverPerson): CoverName => ({
  id: p.id, firstName: p.firstName, lastName: p.lastName, specialty: p.specialty,
});

export function daysBrief(a: CoverAssessment): CoverDayBrief[] {
  return a.days.map((d) => ({
    day: d.day,
    now: d.now,
    then: d.then,
    breach: d.breach,
    skillGap: d.skillGap,
    working: d.working.map(brief),
    away: d.away.map(brief),
  }));
}

/** One workspace, one day, for the chart footer. */
export interface CoverRangeDay {
  day: DateKey;
  rostered: number;
  working: number;
}

export function verdictOf(a: CoverAssessment): CoverVerdict {
  return {
    level: a.level,
    worst: a.worst,
    floor: a.floor,
    breachDays: a.breachDays,
    skillGapDays: a.skillGapDays,
    skill: a.skill,
    rotaKnown: a.rotaKnown,
  };
}

/** Does this level warrant a mark on the bar itself? */
export function coverNeedsAttention(level: CoverLevel): boolean {
  return level !== 'ok';
}

/** How a live headcount compares to the floor. Shared by the "right now" panel. */
export function floorStatus(here: number, minCover: number): 'ok' | 'tight' | 'short' {
  if (minCover <= 0) return 'ok';
  if (here < minCover) return 'short';
  if (here === minCover) return 'tight';
  return 'ok';
}

/** Sanity bounds for the workspace setting — mirrored by the DTO. */
export const MIN_COVER_MAX = 200;

export function validateMinCover(n: unknown): number {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0 || v > MIN_COVER_MAX) {
    throw new Error(`Minimum cover must be a whole number between 0 and ${MIN_COVER_MAX}`);
  }
  return v;
}
