/** Judging a leave request against cover: the verdict per day, the brief, the floor status, the minimum. */
import {
  coverOn,
  eachDay,
  hasRota,
  isRosteredOn,
  sameTrade,
  tradeOf,
  type CoverLeave,
  type CoverPerson,
  type CoverSpace,
  type DateKey,
} from './roster';

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
