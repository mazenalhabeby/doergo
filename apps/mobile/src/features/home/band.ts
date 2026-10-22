
export type Band = 'late' | 'missed' | 'freeSoon' | 'over' | 'breakOver';

/**
 * ⚠️ ORDERING IS FIXED: late → free soon → over → break over.
 *
 * The tile you need is always the one already on screen; the rail is for the
 * rest. A rail that sorts itself by anything else is a rail you have to read.
 */
export const BAND_ORDER: Band[] = ['late', 'missed', 'freeSoon', 'over', 'breakOver'];

/** Nothing on screen is unbounded — `SCALE.md`. */
export const CAPS = {
  /** Tiles in the rail, then a `+n` chip. */
  tiles: 8,
  /** Site rows, then `+n workspaces, all full`. */
  siteRows: 5,
  /** Names on an exception line, then `· n more`. */
  exceptionNames: 2,
  /** Avatars in the steady chip; the number does the rest. */
  steadyFaces: 3,
} as const;

/** Free soon means the next job can go to them. */
export const FREE_SOON_MINUTES = 60;

export interface CrewPerson {
  userId: string;
  firstName: string;
  lastName?: string | null;
  avatarUrl?: string | null;
  /** Which workspace — it decides whether you can walk over. */
  spaceId?: string | null;
  spaceName?: string | null;
  clockInAt?: string | null;
  /**
   * ⚠️ NULL ON TASK/NONE SPACES. Set at clock-in for shift/fixed spaces only.
   * Where it is null there is no shift to be a fraction of.
   */
  expectedClockOutAt?: string | null;
  /**
   * ⚠️ The planned end is the workspace's DAILY LIMIT for clocking in with no
   * shift, not a shift end.
   */
  endIsDailyLimit?: boolean | null;
  /** On a rest right now, and for how long against its allowance. */
  breakMinutes?: number | null;
  breakAllowanceMinutes?: number | null;
  /** Rostered today and never clocked in. */
  scheduledStartAt?: string | null;
  /**
   * On a roster today — an entry that carries a planned start, or a no-show.
   * ⚠️ Decides whether the hero may show `/n` at all: with nobody rostered in
   * scope, "on + missing" is a copy of the numerator ("6/6"), the exact bug
   * `CrewState.rostered` documents.
   */
  rostered?: boolean;
}

export type Ring =
  /** A shift underway, drawn as a fraction of itself. */
  | { kind: 'arc'; fraction: number }
  /** Past the end — full, with a tail sweeping past the top. */
  | { kind: 'over' }
  /** The shift clock is still running underneath a rest. */
  | { kind: 'break'; fraction: number }
  /**
   * ⚠️ PRESENT, NO PROGRESS. The honest ring.
   *
   * `expectedClockOutAt == null` — there is no end to be a fraction of.
   * `endIsDailyLimit === true` — a cut-off is not a finish, and an arc at 90%
   * against a daily cap reads "nearly done" when it means "nearly at the
   * limit".
   */
  | { kind: 'plain' }
  /** ⚠️ Late gets NO ARC. There is no shift underway. */
  | { kind: 'dashedLate' }
  /** Not in. */
  | { kind: 'none' };

/**
 * `in`: on the clock and needing nothing — drawn AFTER the decisions, quietly.
 * Not a `Band`: it is never counted as something that needs you.
 */
export type TileBand = Band | 'in';

export interface CrewTile {
  person: CrewPerson;
  band: Band;
  ring: Ring;
  /** Minutes the figure is about — late by, left, over by, on a rest. */
  minutes: number;
}

export type CrewStateKind =
  /** ① Any band non-empty. */
  | 'busy'
  /** ② Every band empty, somebody on. No tiles at all. */
  | 'calm'
  /** ③ Nobody clocked in, shifts scheduled. The rail shows who is coming. */
  | 'before'
  /** ④ No shifts today in scope — a Sunday, a closed site. */
  | 'nobody'
  /** ⑤ Request failed and presence is never kept. */
  | 'offline';

/** 1 workspace shows people; 4+ shows workspaces. Never chosen, always derived. */
export type CrewUnit = 'people' | 'peopleWithSite' | 'workspaces';

export interface SiteRow {
  spaceId: string;
  spaceName: string;
  on: number;
  rostered: number | null;
  /** The worst thing happening there, for the sort and the label. */
  trouble: { band: Band; count: number } | null;
}

export interface CrewState {
  kind: CrewStateKind;
  unit: CrewUnit;
  /** On the clock right now. */
  on: number;
  /**
   * ⚠️ NULL MEANS DROP THE `/n`, AND THAT IS A FIX, NOT AN ABSENCE.
   *
   * `admin-dashboard.tsx` did this when no roster was in scope:
   *
   *     if (rostered.size === 0) for (const id of clockedInUserIds) rostered.add(id);
   *
   * …which makes "6 of 9" into "6 of 6". The bar is then permanently full and
   * nobody is ever missing — for every supervisor granted attendance but not
   * sites, which is not a rare configuration because the two grants are
   * separate. The comment called it truthful, and it is, as a LIST. As a RATIO
   * it is not, and §3.6 asks for a ratio.
   *
   * A number with no denominator is honest. A denominator that is a copy of
   * the numerator is not.
   */
  rostered: number | null;
  tiles: CrewTile[];
  /** Past the cap — the `+n` chip at the end of the rail. */
  tilesOverflow: number;
  /** Everyone with nothing to decide about them. */
  steady: CrewPerson[];
  /** Rostered and not in — state ③ draws these as "who is coming". */
  coming: CrewPerson[];
  sites: SiteRow[];
  sitesOverflow: number;
}

export const mins = (from: number, to: number) => Math.round((to - from) / 60000);

export const at = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * Which band, if any — and a person in no band is part of a count.
 *
 * ⚠️ A TILE MEANS A DECISION. If nothing is to be decided about somebody they
 * are steady. This is the rule the whole card rests on.
 */
export function bandOf(p: CrewPerson, now: number): Band | null {
  const clockIn = at(p.clockInAt);

  // Rostered, never arrived: somebody has to ring them.
  if (clockIn === null) {
    const start = at(p.scheduledStartAt);
    if (start === null || start > now) return null;
    /*
      ⚠️ LATE ONLY WHILE THE SHIFT IS RUNNING. Once its end has passed they did
      not come — "17h 54 late" for a shift that ended in the night meant
      nothing (02.png). That is MISSED.
    */
    const end = at(p.expectedClockOutAt);
    return end !== null && end <= now ? 'missed' : 'late';
  }

  // A rest past its allowance is a decision, and a payroll consequence.
  const allowance = p.breakAllowanceMinutes ?? null;
  if (p.breakMinutes != null && allowance != null && p.breakMinutes > allowance) return 'breakOver';

  const end = at(p.expectedClockOutAt);
  if (end === null) return null;          // no end — nothing to be soon or over
  if (now > end) return 'over';           // overtime accruing right now
  if (mins(now, end) <= FREE_SOON_MINUTES) return 'freeSoon';
  return null;
}

/** The honest ring — see `Ring`. */
export function ringOf(p: CrewPerson, band: Band | null, now: number): Ring {
  const clockIn = at(p.clockInAt);
  if (clockIn === null) return band === 'late' || band === 'missed' ? { kind: 'dashedLate' } : { kind: 'none' };

  // ⚠️ Both of these are present-without-progress, and neither is a bug.
  if (!p.expectedClockOutAt || p.endIsDailyLimit === true) return { kind: 'plain' };

  const end = at(p.expectedClockOutAt)!;
  if (now > end) return { kind: 'over' };
  const fraction = Math.max(0, Math.min(1, (now - clockIn) / (end - clockIn)));
  return band === 'breakOver' || p.breakMinutes != null
    ? { kind: 'break', fraction }
    : { kind: 'arc', fraction };
}

/** What the figure on the tile is about. */
export function minutesOf(p: CrewPerson, band: Band, now: number): number {
  if (band === 'late' || band === 'missed') return Math.max(0, mins(at(p.scheduledStartAt) ?? now, now));
  if (band === 'breakOver') return p.breakMinutes ?? 0;
  const end = at(p.expectedClockOutAt);
  if (end === null) return 0;
  return band === 'over' ? Math.max(0, mins(end, now)) : Math.max(0, mins(now, end));
}

/**
 * ⚠️ THE UNIT IS DERIVED FROM THE SCOPE, NEVER CHOSEN.
 *
 * Nobody picks a mode. `62 of 148` is not a number anybody can act on and
 * *"three sites are short"* is — so past three workspaces the card counts
 * places instead of people. It is the same widget either way: one registry
 * row, one component, one state machine, and this is a `useMemo` over the
 * scope's length rather than a second component.
 */
export function unitFor(spaceCount: number): CrewUnit {
  if (spaceCount >= 4) return 'workspaces';
  return spaceCount >= 2 ? 'peopleWithSite' : 'people';
}

/** `Karim Bauer 47 min · Mo Osei 12 min` — two names, then `· n more`. */
export function exceptionNames(tiles: CrewTile[]): { names: string[]; more: number } {
  return {
    names: tiles.slice(0, CAPS.exceptionNames).map((t) => t.person.firstName),
    more: Math.max(0, tiles.length - CAPS.exceptionNames),
  };
}

/* ================================================================ assembling the crew */

/** What `/attendance/all-entries?status=CLOCKED_IN` returns, as far as the card reads it. */
export interface CrewEntryInput {
  id: string; userId: string; locationId?: string | null; clockInAt: string;
  expectedClockInAt?: string | null;
  expectedClockOutAt?: string | null; endIsDailyLimit?: boolean | null;
  breakPlan?: { ruleId: string; durationMinutes: number }[] | null;
  user?: { id: string; firstName?: string; lastName?: string } | null;
  location?: { id: string; name?: string } | null;
}

/** One row of `/attendance/breaks/active`. */
export interface CrewBreakInput {
  userId?: string;
  startedAt: string;
  ruleId?: string | null;
  timeEntryId?: string;
  user?: { id: string } | null;
}

/** One row of `/attendance/no-shows`. */
export interface CrewNoShowInput {
  id?: string; userId: string; userName?: string | null; avatarUrl?: string | null;
  spaceId: string; spaceName: string; expectedClockInAt: string; expectedClockOutAt: string; state: string;
}

/** States a no-show leaves the card in: somebody already decided, or they came. */
export const SETTLED_NO_SHOW = ['EXCUSED', 'RESOLVED', 'ARRIVED'];

/** Local midnight of the day `now` falls in — the phone's day, as the reader lives it. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
