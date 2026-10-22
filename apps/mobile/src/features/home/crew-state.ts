import {
  type Band,
  BAND_ORDER,
  CAPS,
  type CrewPerson,
  type Ring,
  type CrewTile,
  type CrewStateKind,
  type SiteRow,
  type CrewState,
  mins,
  at,
  bandOf,
  ringOf,
  minutesOf,
  unitFor,
  type CrewEntryInput,
  type CrewBreakInput,
  type CrewNoShowInput,
  SETTLED_NO_SHOW,
  startOfLocalDay,
} from './band'
import { rosteredCountOf, type CrewAsOf } from './crew-as-of'
export {
  rosteredCountOf,
  type CrewAsOf,
  crewPeopleFrom,
  needsBySpace,
  type QuietTile,
  quietTiles,
} from './crew-as-of'
export {
  type Band,
  BAND_ORDER,
  CAPS,
  type CrewPerson,
  type Ring,
  type CrewTile,
  bandOf,
  ringOf,
  unitFor,
  type CrewEntryInput,
  type CrewBreakInput,
  type CrewNoShowInput,
  startOfLocalDay,
  FREE_SOON_MINUTES,
  type TileBand,
  exceptionNames,
} from './band'
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
