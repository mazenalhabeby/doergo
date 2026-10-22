/**
 * The crew card's height tracks HOW MUCH IS HAPPENING, not how many people
 * there are — and everything below is that rule, or a ⚠️ that protects it.
 */
import {
  crewState, bandOf, ringOf, unitFor, exceptionNames, CAPS, BAND_ORDER, FREE_SOON_MINUTES,
  type CrewPerson,
} from '@/features/home/crew-state';

const NOW = Date.parse('2026-09-24T13:20:00.000Z');
const iso = (minsFromNow: number) => new Date(NOW + minsFromNow * 60000).toISOString();

const person = (over: Partial<CrewPerson> & { userId: string }): CrewPerson => ({
  firstName: 'A', clockInAt: iso(-300), expectedClockOutAt: iso(240), ...over,
});

describe('rule 1 — the rail is not a roster', () => {
  it('somebody steady gets no tile', () => {
    expect(bandOf(person({ userId: '1' }), NOW)).toBeNull();
  });

  it('two hundred calm people make a card with no tiles at all', () => {
    const people = Array.from({ length: 200 }, (_, i) => person({ userId: String(i) }));
    const s = crewState({ people, rosteredCount: 200, spaceIds: ['a'], now: NOW });
    expect(s.kind).toBe('calm');
    expect(s.tiles).toEqual([]);
    expect(s.steady.length).toBe(200);
  });

  it('nine people with three problems make a longer card than two hundred calm ones', () => {
    const busy = crewState({
      people: [
        person({ userId: '1', clockInAt: null, scheduledStartAt: iso(-47) }),
        person({ userId: '2', expectedClockOutAt: iso(25) }),
        person({ userId: '3', expectedClockOutAt: iso(-20) }),
        ...Array.from({ length: 6 }, (_, i) => person({ userId: `s${i}` })),
      ],
      rosteredCount: 9, spaceIds: ['a'], now: NOW,
    });
    const calm = crewState({
      people: Array.from({ length: 200 }, (_, i) => person({ userId: String(i) })),
      rosteredCount: 200, spaceIds: ['a'], now: NOW,
    });
    expect(busy.tiles.length).toBeGreaterThan(calm.tiles.length);
  });

  it('orders late → missed → free soon → over → break over', () => {
    const s = crewState({
      people: [
        person({ userId: 'break', breakMinutes: 40, breakAllowanceMinutes: 30 }),
        person({ userId: 'over', expectedClockOutAt: iso(-10) }),
        person({ userId: 'soon', expectedClockOutAt: iso(25) }),
        person({ userId: 'late', clockInAt: null, scheduledStartAt: iso(-47), expectedClockOutAt: iso(400) }),
        person({ userId: 'missed', clockInAt: null, scheduledStartAt: iso(-900), expectedClockOutAt: iso(-420) }),
      ],
      rosteredCount: 5, spaceIds: ['a'], now: NOW,
    });
    expect(s.tiles.map((x) => x.band)).toEqual(BAND_ORDER);
  });

  it('free soon is exactly the next hour', () => {
    expect(bandOf(person({ userId: '1', expectedClockOutAt: iso(FREE_SOON_MINUTES) }), NOW)).toBe('freeSoon');
    expect(bandOf(person({ userId: '1', expectedClockOutAt: iso(FREE_SOON_MINUTES + 1) }), NOW)).toBeNull();
  });
});

describe('the honest ring — two cases where an arc would lie', () => {
  it('draws no arc when there is no expected end', () => {
    // Null on task/none spaces. There is nothing to be a fraction of.
    const p = person({ userId: '1', expectedClockOutAt: null });
    expect(ringOf(p, bandOf(p, NOW), NOW)).toEqual({ kind: 'plain' });
  });

  it('draws no arc against a daily limit', () => {
    /*
      ⚠️ A cut-off is not a finish. An arc at 90% against a daily cap reads
      "nearly done" when it means "nearly at the limit".
    */
    const p = person({ userId: '1', endIsDailyLimit: true });
    expect(ringOf(p, bandOf(p, NOW), NOW)).toEqual({ kind: 'plain' });
  });

  it('late gets no arc — there is no shift underway to be a fraction of', () => {
    const p = person({ userId: '1', clockInAt: null, scheduledStartAt: iso(-47) });
    expect(ringOf(p, 'late', NOW)).toEqual({ kind: 'dashedLate' });
  });
});

describe('⑥ the denominator that was a copy of the numerator', () => {
  it('drops the /n when there is no roster in scope', () => {
    /*
      ⚠️ `if (rostered.size === 0) for (const id of clockedInUserIds) rostered.add(id)`
      made "6 of 9" into "6 of 6": the bar full forever, nobody ever missing,
      for every supervisor granted attendance but not sites.
    */
    const s = crewState({
      people: [person({ userId: '1' }), person({ userId: '2' })],
      rosteredCount: 0, spaceIds: ['a'], now: NOW,
    });
    expect(s.on).toBe(2);
    expect(s.rostered).toBeNull();
  });

  it('keeps the /n when there is one', () => {
    const s = crewState({ people: [person({ userId: '1' })], rosteredCount: 9, spaceIds: ['a'], now: NOW });
    expect(s.rostered).toBe(9);
  });
});

describe('rule 2 — the unit is derived from the scope, never chosen', () => {
  it('one workspace shows people', () => expect(unitFor(1)).toBe('people'));
  it('two or three show people with the site', () => {
    expect(unitFor(2)).toBe('peopleWithSite');
    expect(unitFor(3)).toBe('peopleWithSite');
  });
  it('four or more show workspaces — 62 of 148 is not a number anybody can act on', () => {
    expect(unitFor(4)).toBe('workspaces');
    expect(unitFor(12)).toBe('workspaces');
  });
});

describe('nothing on screen is unbounded', () => {
  it('caps the rail and counts the rest', () => {
    const people = Array.from({ length: 12 }, (_, i) =>
      person({ userId: String(i), clockInAt: null, scheduledStartAt: iso(-10) }));
    const s = crewState({ people, rosteredCount: 12, spaceIds: ['a'], now: NOW });
    expect(s.tiles.length).toBe(CAPS.tiles);
    expect(s.tilesOverflow).toBe(4);
  });

  it('names two on an exception line, then counts', () => {
    const tiles = Array.from({ length: 5 }, (_, i) => ({
      person: person({ userId: String(i), firstName: `N${i}` }),
      band: 'late' as const, ring: { kind: 'dashedLate' } as const, minutes: 1,
    }));
    expect(exceptionNames(tiles)).toEqual({ names: ['N0', 'N1'], more: 3 });
  });

  it('caps site rows', () => {
    const people = Array.from({ length: 9 }, (_, i) =>
      person({ userId: String(i), spaceId: `s${i}`, spaceName: `Site ${i}` }));
    const s = crewState({ people, rosteredCount: 9, spaceIds: people.map((p) => p.spaceId!), now: NOW });
    expect(s.sites.length).toBe(CAPS.siteRows);
    expect(s.sitesOverflow).toBe(4);
  });
});

describe('the six states are a closed list', () => {
  it('has no seventh', () => {
    const one = (o: Parameters<typeof crewState>[0]) => crewState({ ...o, now: NOW }).kind;
    expect(one({ people: [person({ userId: '1', expectedClockOutAt: iso(10) })], rosteredCount: 1, spaceIds: ['a'] })).toBe('busy');
    expect(one({ people: [person({ userId: '1' })], rosteredCount: 1, spaceIds: ['a'] })).toBe('calm');
    expect(one({ people: [person({ userId: '1', clockInAt: null, scheduledStartAt: iso(60) })], rosteredCount: 1, spaceIds: ['a'] })).toBe('before');
    expect(one({ people: [], rosteredCount: 0, spaceIds: ['a'] })).toBe('nobody');
    expect(one({ people: [person({ userId: '1' })], rosteredCount: 1, spaceIds: ['a'], failed: true })).toBe('offline');
  });

  it('⑤ presence is never kept — a failure shows nothing, not this morning', () => {
    /*
      ⚠️ Stale is wrong, not old. No "last updated" line either: it invites the
      reader to treat an old number as roughly true, which is the exact failure
      this state exists to prevent.
    */
    const s = crewState({
      people: Array.from({ length: 6 }, (_, i) => person({ userId: String(i) })),
      rosteredCount: 9, spaceIds: ['a'], failed: true, now: NOW,
    });
    expect(s.on).toBe(0);
    expect(s.rostered).toBeNull();
    expect(s.tiles).toEqual([]);
  });
});

describe('missed — late only while the shift is running (02.png)', () => {
  it('a rostered no-show whose shift has ENDED is missed, not "17h late"', () => {
    const now = Date.parse('2026-09-26T16:20:00Z');
    const base = { userId: 'u', firstName: 'Mike', clockInAt: null } as const;
    expect(bandOf({ ...base, scheduledStartAt: '2026-09-25T20:26:00Z', expectedClockOutAt: '2026-09-26T04:26:00Z' }, now)).toBe('missed');
    expect(bandOf({ ...base, scheduledStartAt: '2026-09-26T14:16:00Z', expectedClockOutAt: '2026-09-26T22:16:00Z' }, now)).toBe('late');
    expect(bandOf({ ...base, scheduledStartAt: '2026-09-26T17:00:00Z', expectedClockOutAt: '2026-09-27T01:00:00Z' }, now)).toBeNull();
  });
});
