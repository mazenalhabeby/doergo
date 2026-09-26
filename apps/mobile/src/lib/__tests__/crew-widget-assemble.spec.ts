/**
 * The Crew card: from the server's three answers to the people it draws.
 *
 * `crewPeopleFrom` is what `useCrew` does with the responses; `rosteredCountOf`
 * and `needsBySpace` are what the card reads off them. Each ⚠️ below was a
 * wrong number on a real screen.
 */
import {
  crewPeopleFrom, rosteredCountOf, needsBySpace, crewState, unitFor, startOfLocalDay, CAPS,
  type CrewEntryInput, type CrewNoShowInput, type CrewPerson,
} from '../../components/home/crew-state';

/* A fixed local afternoon, so "today" has a morning and a yesterday. */
const NOW = new Date(2026, 8, 24, 15, 0, 0).getTime();
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 8, 24 + dayOffset, h, m, 0).toISOString();

const entry = (over: Partial<CrewEntryInput> & { id: string; userId: string }): CrewEntryInput => ({
  locationId: 'a', clockInAt: at(8), expectedClockInAt: at(8), expectedClockOutAt: at(17),
  user: { id: over.userId, firstName: 'F' + over.userId, lastName: 'L' }, location: { id: over.locationId ?? 'a', name: 'Site ' + (over.locationId ?? 'a') },
  ...over,
});
const noShow = (over: Partial<CrewNoShowInput> & { userId: string }): CrewNoShowInput => ({
  userName: 'Karim Bauer', spaceId: 'a', spaceName: 'Site a', expectedClockInAt: at(14), expectedClockOutAt: at(22), state: 'ESCALATED',
  ...over,
});

describe('no-shows — TODAY, not the last 24 hours', () => {
  /*
    ⚠️ `?days=1` is a ROLLING window on the server. At 15:00 it still holds
    yesterday's 16:00–23:00 shift, and the card opened "missed" every day.
  */
  it("drops yesterday's missed shift even though the server's 24h window still returns it", () => {
    const { people, notArrived } = crewPeopleFrom({
      entries: [], breaks: [], now: NOW,
      noShows: [noShow({ userId: 'y', expectedClockInAt: at(16, 0, -1), expectedClockOutAt: at(23, 0, -1) })],
    });
    expect(notArrived).toEqual([]);
    expect(people).toEqual([]);
  });

  it('keeps a night shift that started yesterday and ended this morning — that is today', () => {
    const { notArrived } = crewPeopleFrom({
      entries: [], breaks: [], now: NOW,
      noShows: [noShow({ userId: 'n', expectedClockInAt: at(22, 0, -1), expectedClockOutAt: at(6) })],
    });
    expect(notArrived.map((n) => n.userId)).toEqual(['n']);
  });

  it('keeps this morning\'s shift, and one running now', () => {
    const { notArrived } = crewPeopleFrom({
      entries: [], breaks: [], now: NOW,
      noShows: [
        noShow({ userId: 'm', expectedClockInAt: at(6), expectedClockOutAt: at(10) }),
        noShow({ userId: 'r', expectedClockInAt: at(14), expectedClockOutAt: at(22) }),
      ],
    });
    expect(notArrived.map((n) => n.userId).sort()).toEqual(['m', 'r']);
  });

  it('never a shift that has not started', () => {
    const { notArrived } = crewPeopleFrom({ entries: [], breaks: [], now: NOW, noShows: [noShow({ userId: 'f', expectedClockInAt: at(16) })] });
    expect(notArrived).toEqual([]);
  });

  it.each(['EXCUSED', 'RESOLVED', 'ARRIVED'])('never a %s one — somebody already decided', (state) => {
    const { notArrived } = crewPeopleFrom({ entries: [], breaks: [], now: NOW, noShows: [noShow({ userId: 'x', state })] });
    expect(notArrived).toEqual([]);
  });

  it('never somebody who is on the clock now, wherever', () => {
    const { people, notArrived } = crewPeopleFrom({
      entries: [entry({ id: 'e1', userId: 'k', locationId: 'b' })], breaks: [], now: NOW,
      noShows: [noShow({ userId: 'k', spaceId: 'a' })],
    });
    expect(notArrived).toEqual([]);
    expect(people).toHaveLength(1);
  });

  /*
    ⚠️ A split day — missed in the morning, late in the afternoon, same site —
    drew two tiles with ONE React key and counted the person twice.
  */
  it('one row per person per workspace — the latest shift wins', () => {
    const { people, notArrived } = crewPeopleFrom({
      entries: [], breaks: [], now: NOW,
      noShows: [
        noShow({ userId: 'l', expectedClockInAt: at(14), expectedClockOutAt: at(22) }),
        noShow({ userId: 'l', expectedClockInAt: at(6), expectedClockOutAt: at(10) }),
      ],
    });
    expect(notArrived).toHaveLength(1);
    expect(people).toHaveLength(1);
    expect(people[0]!.scheduledStartAt).toBe(at(14));
    const s = crewState({ people, rosteredCount: rosteredCountOf(people), spaceIds: ['a'], now: NOW });
    const keys = s.tiles.map((t) => `${t.person.userId}:${t.person.spaceId ?? ''}:${t.band}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the same person missing in two workspaces is two rows — each site is told', () => {
    const { notArrived } = crewPeopleFrom({
      entries: [], breaks: [], now: NOW,
      noShows: [noShow({ userId: 'l', spaceId: 'a' }), noShow({ userId: 'l', spaceId: 'b', spaceName: 'Site b' })],
    });
    expect(notArrived).toHaveLength(2);
  });

  it('splits the name once, and a missing name is a dash, never "undefined"', () => {
    const { people } = crewPeopleFrom({
      entries: [], breaks: [], now: NOW,
      noShows: [noShow({ userId: 'a', userName: 'Anna Maria Müller' }), noShow({ userId: 'b', userName: null })],
    });
    expect(people[0]).toMatchObject({ firstName: 'Anna', lastName: 'Maria Müller' });
    expect(people[1]).toMatchObject({ firstName: '—', lastName: null });
  });
});

describe('breaks — keyed by the entry, allowance only for a planned rest', () => {
  it('a planned rest past its allowance is "long break"', () => {
    const { people } = crewPeopleFrom({
      entries: [entry({ id: 'e1', userId: 'u', breakPlan: [{ ruleId: 'lunch', durationMinutes: 30 }] })],
      breaks: [{ timeEntryId: 'e1', startedAt: new Date(NOW - 45 * 60000).toISOString(), ruleId: 'lunch' }],
      noShows: [], now: NOW,
    });
    expect(people[0]).toMatchObject({ breakMinutes: 45, breakAllowanceMinutes: 30 });
    expect(crewState({ people, rosteredCount: 1, spaceIds: ['a'], now: NOW }).tiles[0]!.band).toBe('breakOver');
  });

  it('a rest somebody simply took has no allowance, so it is never "over"', () => {
    const { people } = crewPeopleFrom({
      entries: [entry({ id: 'e1', userId: 'u' })],
      breaks: [{ timeEntryId: 'e1', startedAt: new Date(NOW - 90 * 60000).toISOString(), ruleId: null }],
      noShows: [], now: NOW,
    });
    expect(people[0]!.breakAllowanceMinutes).toBeNull();
    expect(crewState({ people, rosteredCount: 1, spaceIds: ['a'], now: NOW }).tiles).toEqual([]);
  });

  it('a break with no entry id still finds its person by the flattened user', () => {
    const { people } = crewPeopleFrom({
      entries: [entry({ id: 'e1', userId: 'u' })],
      breaks: [{ user: { id: 'u' }, startedAt: new Date(NOW - 5 * 60000).toISOString() }],
      noShows: [], now: NOW,
    });
    expect(people[0]!.breakMinutes).toBe(5);
  });

  it('a garbled start time is no break, not NaN minutes', () => {
    const { people } = crewPeopleFrom({
      entries: [entry({ id: 'e1', userId: 'u' })], breaks: [{ timeEntryId: 'e1', startedAt: 'nope' }], noShows: [], now: NOW,
    });
    expect(people[0]!.breakMinutes).toBeNull();
  });
});

describe('the hero\'s "/n" — never a copy of the numerator', () => {
  it('nobody rostered in scope → no denominator at all', () => {
    const { people } = crewPeopleFrom({
      entries: [entry({ id: '1', userId: 'a', expectedClockInAt: null, expectedClockOutAt: null }), entry({ id: '2', userId: 'b', expectedClockInAt: null, expectedClockOutAt: null })],
      breaks: [], noShows: [], now: NOW,
    });
    expect(rosteredCountOf(people)).toBe(0);
    const s = crewState({ people, rosteredCount: rosteredCountOf(people), spaceIds: ['a'], now: NOW });
    expect(s.on).toBe(2);
    expect(s.rostered).toBeNull();
  });

  it('a roster in scope → on + not in', () => {
    const { people } = crewPeopleFrom({
      entries: [entry({ id: '1', userId: 'a' }), entry({ id: '2', userId: 'b' })],
      breaks: [], noShows: [noShow({ userId: 'c' })], now: NOW,
    });
    const s = crewState({ people, rosteredCount: rosteredCountOf(people), spaceIds: ['a'], now: NOW });
    expect(s.on).toBe(2);
    expect(s.rostered).toBe(3);
  });

  it('only a no-show rostered is still a roster (nobody in yet)', () => {
    const { people } = crewPeopleFrom({ entries: [], breaks: [], noShows: [noShow({ userId: 'c' })], now: NOW });
    expect(rosteredCountOf(people)).toBe(1);
  });

  it('nobody at all is 0 → no "/0"', () => {
    expect(rosteredCountOf([])).toBe(0);
    expect(crewState({ people: [], rosteredCount: 0, spaceIds: [], now: NOW }).rostered).toBeNull();
  });
});

describe('who needs you — counted over everyone, not over the capped tiles', () => {
  it('twelve late means twelve, though only eight tiles are drawn', () => {
    const late: CrewPerson[] = Array.from({ length: 12 }, (_, i) => ({
      userId: `l${i}`, firstName: 'L', spaceId: 'a', clockInAt: null, scheduledStartAt: at(14), expectedClockOutAt: at(22),
    }));
    const s = crewState({ people: late, rosteredCount: 12, spaceIds: ['a'], now: NOW });
    expect(s.tiles).toHaveLength(CAPS.tiles);
    expect(needsBySpace(late, NOW)).toEqual({ a: 12 });
  });

  it('counts late and missed only — free soon and over are not "need you"', () => {
    const people: CrewPerson[] = [
      { userId: '1', firstName: 'a', spaceId: 'a', clockInAt: null, scheduledStartAt: at(14), expectedClockOutAt: at(22) },
      { userId: '2', firstName: 'b', spaceId: 'b', clockInAt: null, scheduledStartAt: at(6), expectedClockOutAt: at(10) },
      { userId: '3', firstName: 'c', spaceId: 'a', clockInAt: at(8), expectedClockOutAt: at(15, 30) },
      { userId: '4', firstName: 'd', spaceId: 'a', clockInAt: at(8), expectedClockOutAt: at(14) },
    ];
    expect(needsBySpace(people, NOW)).toEqual({ a: 1, b: 1 });
  });
});

describe('the unit is derived from the scope', () => {
  it.each([[0, 'people'], [1, 'people'], [2, 'peopleWithSite'], [3, 'peopleWithSite'], [4, 'workspaces'], [40, 'workspaces']])(
    '%i workspaces → %s', (n, unit) => expect(unitFor(n as number)).toBe(unit),
  );
});

describe('the five states', () => {
  it('offline: nothing kept, nothing counted', () => {
    const s = crewState({ people: [{ userId: 'a', firstName: 'a', clockInAt: at(8) }], rosteredCount: 1, spaceIds: ['a'], failed: true, now: NOW });
    expect(s).toMatchObject({ kind: 'offline', on: 0, rostered: null, tiles: [], steady: [] });
  });

  it('nobody: no people, no roster', () => {
    expect(crewState({ people: [], rosteredCount: 0, spaceIds: [], now: NOW }).kind).toBe('nobody');
  });

  it('before: nobody in, somebody coming later', () => {
    const s = crewState({
      people: [{ userId: 'c', firstName: 'c', clockInAt: null, scheduledStartAt: at(16), expectedClockOutAt: at(22) }],
      rosteredCount: 1, spaceIds: ['a'], now: NOW,
    });
    expect(s.kind).toBe('before');
    expect(s.coming).toHaveLength(1);
  });

  it('the day boundary is the phone\'s local midnight', () => {
    expect(new Date(startOfLocalDay(NOW)).getHours()).toBe(0);
    expect(startOfLocalDay(NOW)).toBeLessThanOrEqual(NOW);
    expect(NOW - startOfLocalDay(NOW)).toBeLessThan(86_400_000);
  });
});
