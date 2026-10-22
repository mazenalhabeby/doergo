import {
  type CrewPerson,
  type Ring,
  mins,
  at,
  bandOf,
  ringOf,
  type CrewEntryInput,
  type CrewBreakInput,
  type CrewNoShowInput,
  SETTLED_NO_SHOW,
  startOfLocalDay,
} from './band'

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

/**
 * ⭐ EVERYONE WHO IS IN, AS QUIET TILES AFTER THE DECISIONS.
 *
 * "1/2 on the clock" and no way to see who — the steady people collapsed into
 * a grey count. They now follow the tiles that need you, with their ring and
 * how long they have been on. Already in hand (the card fetched everyone for
 * the count): no request, and the rail only draws the tiles near the screen.
 */
export interface QuietTile {
  person: CrewPerson;
  band: 'in';
  ring: Ring;
  minutes: number;
}

export function quietTiles(steady: CrewPerson[], now: number): QuietTile[] {
  return steady
    .map((p) => ({ person: p, band: 'in' as const, ring: ringOf(p, null, now), minutes: Math.max(0, mins(at(p.clockInAt) ?? now, now)) }))
    // Longest on first — the order a supervisor reads a floor in.
    .sort((a, b) => b.minutes - a.minutes);
}
