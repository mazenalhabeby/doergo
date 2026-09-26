/**
 * The Crew card with a crew nobody drew it for.
 *
 * Every minute the phone rebuilds the card from scratch: `crewPeopleFrom`
 * over the answers, then `crewState` for the scope, then once more per
 * workspace ring. A rule that is quadratic in people is invisible at nine and
 * a frozen home screen at a few thousand — grouping a site by copying its
 * list per person was exactly that.
 */
import { crewPeopleFrom, crewState, needsBySpace, rosteredCountOf, CAPS, type CrewEntryInput, type CrewNoShowInput } from '../../components/home/crew-state';

const NOW = new Date(2026, 8, 24, 15, 0, 0).getTime();
const iso = (mins: number) => new Date(NOW + mins * 60000).toISOString();

function crew(n: number, spaces: number) {
  const entries: CrewEntryInput[] = [];
  const noShows: CrewNoShowInput[] = [];
  for (let i = 0; i < n; i++) {
    const space = `s${i % spaces}`;
    if (i % 10 === 0) {
      noShows.push({ userId: `u${i}`, userName: `N ${i}`, spaceId: space, spaceName: space, expectedClockInAt: iso(-30), expectedClockOutAt: iso(400), state: 'ESCALATED' });
    } else {
      entries.push({
        id: `e${i}`, userId: `u${i}`, locationId: space, clockInAt: iso(-300), expectedClockInAt: iso(-300),
        expectedClockOutAt: iso(i % 7 === 0 ? 20 : 200), user: { id: `u${i}`, firstName: `F${i}` }, location: { id: space, name: space },
      });
    }
  }
  return { entries, noShows };
}

describe('huge crews', () => {
  it('10,000 people on ONE site assemble and decide in well under a frame budget per step', () => {
    const { entries, noShows } = crew(10_000, 1);
    const t0 = Date.now();
    const { people } = crewPeopleFrom({ entries, breaks: [], noShows, now: NOW });
    const s = crewState({ people, rosteredCount: rosteredCountOf(people), spaceIds: ['s0'], now: NOW });
    needsBySpace(people, NOW);
    const ms = Date.now() - t0;
    expect(people).toHaveLength(10_000);
    expect(ms).toBeLessThan(500);
    // Whatever the crowd, the rail is bounded.
    expect(s.tiles).toHaveLength(CAPS.tiles);
    expect(s.tilesOverflow).toBeGreaterThan(1000);
    expect(s.sites.length).toBeLessThanOrEqual(CAPS.siteRows);
  });

  it('grows linearly: 10× the people is nowhere near 100× the time', () => {
    const time = (n: number) => {
      const { entries, noShows } = crew(n, 1);
      const { people } = crewPeopleFrom({ entries, breaks: [], noShows, now: NOW });
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 3; i++) crewState({ people, rosteredCount: people.length, spaceIds: ['s0'], now: NOW });
      return Number(process.hrtime.bigint() - t0);
    };
    time(2000); // warm the JIT
    const small = time(2000);
    const big = time(20_000);
    expect(big / small).toBeLessThan(40);
  });

  it('300 workspaces: sites capped at five, overflow counted, all people accounted for', () => {
    const { entries, noShows } = crew(3000, 300);
    const { people } = crewPeopleFrom({ entries, breaks: [], noShows, now: NOW });
    const ids = [...new Set(people.map((p) => p.spaceId!))];
    const s = crewState({ people, rosteredCount: people.length, spaceIds: ids, now: NOW });
    expect(s.unit).toBe('workspaces');
    expect(s.sites).toHaveLength(CAPS.siteRows);
    expect(s.sites.length + s.sitesOverflow).toBe(300);
    expect(s.on + s.coming.length).toBe(3000);
    // Worst first: a site with somebody late leads.
    expect(s.sites[0]!.trouble?.band).toBe('late');
  });

  it('the late count matches the no-shows exactly at scale', () => {
    const { entries, noShows } = crew(5000, 12);
    const { people } = crewPeopleFrom({ entries, breaks: [], noShows, now: NOW });
    const total = Object.values(needsBySpace(people, NOW)).reduce((a, b) => a + b, 0);
    expect(total).toBe(noShows.length);
  });
});
