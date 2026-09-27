/**
 * Who is on, who is late, what is waiting — decided once, drawn by `crew-card`.
 *
 * ⚠️ THE CARD'S HEIGHT TRACKS HOW MUCH IS HAPPENING, NOT HOW MANY PEOPLE THERE
 * ARE. That is the whole design, and it is the only version of this card that
 * survives a customer who grows:
 *
 *     200 people, calm morning  →  a short card
 *       9 people, 3 problems    →  a long card
 *
 * The first draft showed six tiles because it COULD, not because six people
 * needed anything. A tile exists only when there is something to DECIDE about
 * that person; everyone steady collapses into one chip with a count.
 *
 * Pure, and separate from the component, because this is the part worth
 * testing: the bands, the caps, the two cases where a ring would lie, and the
 * denominator that used to be a copy of the numerator.
 */

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

const mins = (from: number, to: number) => Math.round((to - from) / 60000);
const at = (iso?: string | null): number | null => {
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

export function crewState(input: {
  people: CrewPerson[];
  /** How many are rostered in scope. ⚠️ 0 means NO ROSTER, not nobody. */
  rosteredCount: number;
  spaceIds: string[];
  /** The request failed, and presence is never kept. */
  failed?: boolean;
  now?: number;
}): CrewState {
  const now = input.now ?? Date.now();
  const unit = unitFor(input.spaceIds.length);

  const empty: CrewState = {
    kind: 'offline', unit, on: 0, rostered: null,
    tiles: [], tilesOverflow: 0, steady: [], coming: [], sites: [], sitesOverflow: 0,
  };
  /*
    ⚠️ PRESENCE IS NEVER CACHED — stale is wrong, not old. The hero goes to a
    dash and the card says why. It does not show this morning's count at four
    in the afternoon, and there is no "last updated" line: that invites the
    reader to treat an old number as roughly true, which is the exact failure
    this state exists to prevent.
  */
  if (input.failed) return empty;

  const on = input.people.filter((p) => at(p.clockInAt) !== null).length;
  const coming = input.people.filter((p) => at(p.clockInAt) === null && at(p.scheduledStartAt) !== null);

  const banded: CrewTile[] = [];
  const steady: CrewPerson[] = [];
  for (const p of input.people) {
    const band = bandOf(p, now);
    if (band === null) {
      if (at(p.clockInAt) !== null) steady.push(p);
      continue;
    }
    banded.push({ person: p, band, ring: ringOf(p, band, now), minutes: minutesOf(p, band, now) });
  }
  banded.sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band));

  const tiles = banded.slice(0, CAPS.tiles);
  const tilesOverflow = Math.max(0, banded.length - CAPS.tiles);

  // One row per workspace, worst first — a site row is the same card in miniature.
  const bySpace = new Map<string, CrewPerson[]>();
  for (const p of input.people) {
    const id = p.spaceId ?? '';
    if (!id) continue;
    // ⚠️ push, not `[...old, p]` — copying the list per person was O(n²) on one big site.
    const list = bySpace.get(id);
    if (list) list.push(p); else bySpace.set(id, [p]);
  }
  const allSites: SiteRow[] = [...bySpace.entries()].map(([spaceId, ps]) => {
    const counts = new Map<Band, number>();
    for (const p of ps) {
      const b = bandOf(p, now);
      if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    const worst = BAND_ORDER.find((b) => counts.has(b)) ?? null;
    return {
      spaceId,
      spaceName: ps[0]?.spaceName ?? spaceId,
      on: ps.filter((p) => at(p.clockInAt) !== null).length,
      rostered: null,
      trouble: worst ? { band: worst, count: counts.get(worst)! } : null,
    };
  });
  allSites.sort((a, b) => {
    const rank = (s: SiteRow) => (s.trouble ? BAND_ORDER.indexOf(s.trouble.band) : BAND_ORDER.length);
    return rank(a) - rank(b);
  });

  const kind: CrewStateKind =
    banded.length > 0 ? 'busy'
    : on > 0 ? 'calm'
    : coming.length > 0 ? 'before'
    : 'nobody';

  return {
    kind, unit, on,
    // ⚠️ null, never a copy of the numerator — see `rostered` on CrewState.
    rostered: input.rosteredCount > 0 ? input.rosteredCount : null,
    tiles, tilesOverflow,
    steady,
    coming,
    sites: allSites.slice(0, CAPS.siteRows),
    sitesOverflow: Math.max(0, allSites.length - CAPS.siteRows),
  };
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
export interface CrewBreakInput { userId?: string; startedAt: string; ruleId?: string | null; timeEntryId?: string; user?: { id: string } | null }
/** One row of `/attendance/no-shows`. */
export interface CrewNoShowInput {
  id?: string; userId: string; userName?: string | null; avatarUrl?: string | null;
  spaceId: string; spaceName: string; expectedClockInAt: string; expectedClockOutAt: string; state: string;
}

/** States a no-show leaves the card in: somebody already decided, or they came. */
const SETTLED_NO_SHOW = ['EXCUSED', 'RESOLVED', 'ARRIVED'];

/** Local midnight of the day `now` falls in — the phone's day, as the reader lives it. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * The three answers → one list of people, decided once and tested.
 *
 * ⚠️ TODAY IS THE PHONE'S DAY, NOT THE LAST 24 HOURS. `?days=1` on the server
 * is a ROLLING window, so at 08:00 yesterday's 09:00–17:00 no-show was still
 * in it and every morning opened "1 missed their shift" — a card that is
 * never calm stops being read (FINDINGS §04). A shift counts when it is still
 * running today or ENDED today; a night shift that ended at 06:00 is today's.
 *
 * ⚠️ ONE ROW PER PERSON PER WORKSPACE. Two missed shifts in one site (a split
 * day) drew two tiles with the same React key and counted the person twice in
 * the denominator. The latest shift wins: it is the one somebody can still act on.
 */
export function crewPeopleFrom(input: {
  entries: CrewEntryInput[];
  breaks: CrewBreakInput[];
  noShows: CrewNoShowInput[];
  now: number;
}): { people: CrewPerson[]; notArrived: CrewNoShowInput[] } {
  const { now } = input;
  const onBreak = new Map<string, CrewBreakInput>();
  for (const b of input.breaks) onBreak.set(b.timeEntryId ?? b.user?.id ?? b.userId ?? '', b);

  const people: CrewPerson[] = input.entries.map((e) => {
    const brk = onBreak.get(e.id) ?? onBreak.get(e.userId);
    /*
      ⚠️ An allowance exists only for a PLANNED rest — the plan item the break
      satisfies. A break somebody simply took has no allowance, so it can never
      be "over"; saying otherwise would invent a rule.
    */
    const planned = brk?.ruleId ? (e.breakPlan ?? []).find((p) => p.ruleId === brk.ruleId) : undefined;
    const started = brk ? Date.parse(brk.startedAt) : NaN;
    return {
      userId: e.userId,
      firstName: e.user?.firstName ?? '—',
      lastName: e.user?.lastName ?? null,
      spaceId: e.locationId ?? e.location?.id ?? null,
      spaceName: e.location?.name ?? null,
      clockInAt: e.clockInAt,
      expectedClockOutAt: e.expectedClockOutAt ?? null,
      endIsDailyLimit: e.endIsDailyLimit ?? null,
      breakMinutes: brk && Number.isFinite(started) ? Math.max(0, Math.round((now - started) / 60000)) : null,
      breakAllowanceMinutes: planned?.durationMinutes ?? null,
      rostered: !!e.expectedClockInAt,
    };
  });

  const onIds = new Set(people.map((p) => p.userId));
  const dayStart = startOfLocalDay(now);
  const latest = new Map<string, CrewNoShowInput>();
  for (const n of input.noShows) {
    const start = Date.parse(n.expectedClockInAt);
    if (!Number.isFinite(start) || start > now) continue;            // not due yet
    if (onIds.has(n.userId) || SETTLED_NO_SHOW.includes(n.state)) continue;
    const end = Date.parse(n.expectedClockOutAt);
    if ((Number.isFinite(end) ? end : start) < dayStart) continue;   // yesterday's
    const key = `${n.userId}:${n.spaceId}`;
    const had = latest.get(key);
    if (!had || Date.parse(had.expectedClockInAt) < start) latest.set(key, n);
  }
  const notArrived = [...latest.values()];
  for (const n of notArrived) {
    const [firstName, ...rest] = (n.userName ?? '').split(' ');
    people.push({
      userId: n.userId, firstName: firstName || '—', lastName: rest.join(' ') || null, avatarUrl: n.avatarUrl ?? null,
      spaceId: n.spaceId, spaceName: n.spaceName, clockInAt: null, scheduledStartAt: n.expectedClockInAt,
      expectedClockOutAt: n.expectedClockOutAt, rostered: true,
    });
  }
  return { people, notArrived };
}

/**
 * The hero's denominator for a scope: everybody expected (on + not in) — or
 * 0, which `crewState` turns into NO `/n`, when nobody in scope is on a roster.
 */
export function rosteredCountOf(people: CrewPerson[]): number {
  return people.some((p) => p.rostered) ? people.length : 0;
}

/**
 * People who need you (late or missed), per workspace — the rings' red badge
 * and the home pitch.
 *
 * ⚠️ COUNTED OVER EVERYONE, NOT OVER THE TILES. The tiles are capped at
 * `CAPS.tiles`; counting them said "8 need you" with twelve people late.
 */
export function needsBySpace(people: CrewPerson[], now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of people) {
    if (!p.spaceId) continue;
    const b = bandOf(p, now);
    if (b === 'late' || b === 'missed') out[p.spaceId] = (out[p.spaceId] ?? 0) + 1;
  }
  return out;
}

/**
 * ⭐ THE CREW, AS OF A MOMENT — what the card may show with no signal.
 *
 * Presence is never kept (a kept "late" is wrong, not old). What IS kept is
 * this: COUNTS per workspace and the time they were true — no names, no
 * people, nothing about anyone in particular. The card draws it greyed out,
 * "as of 08:12 · may have changed", with no late markers and nothing to act on.
 * Kept per user, for today only, and wiped on sign-out (home/remember).
 */
export interface CrewAsOf {
  at: number;
  on: number;
  rostered: number | null;
  sites: { spaceId: string; spaceName: string; on: number }[];
}

export function crewAsOf(people: CrewPerson[], at: number): CrewAsOf {
  const spaceIds = [...new Set(people.map((p) => p.spaceId).filter((x): x is string => !!x))];
  const all = crewState({ people, rosteredCount: rosteredCountOf(people), spaceIds, now: at });
  return {
    at,
    on: all.on,
    rostered: all.rostered,
    sites: spaceIds.map((id) => {
      const here = people.filter((p) => p.spaceId === id);
      return {
        spaceId: id,
        spaceName: here[0]?.spaceName ?? '',
        on: crewState({ people: here, rosteredCount: rosteredCountOf(here), spaceIds: [id], now: at }).on,
      };
    }),
  };
}
