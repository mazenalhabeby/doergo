import { attribute, custodyDayWindow, entryHolder, heldDuringDay, totalsByPeriod, type CustodyPeriod } from '../custody';

const VIE = 'Europe/Vienna';
// Ahmed hands the van to Bea at 09:00 Vienna (07:00Z) on 10 Sept.
const A: CustodyPeriod = { id: 'a', userId: 'ahmed', startedAt: '2026-09-01T06:00:00Z', endedAt: '2026-09-10T07:00:00Z' };
const B: CustodyPeriod = { id: 'b', userId: 'bea', startedAt: '2026-09-10T07:00:00Z', endedAt: null };
const NOON_10TH = '2026-09-10T10:00:00Z'; // 12:00 Vienna — a past day as the phone files it

describe('custody by the day (receipts carry a day)', () => {
  it('the day is the local day of the zone', () => {
    const w = custodyDayWindow(NOON_10TH, VIE);
    expect(w.from.toISOString()).toBe('2026-09-09T22:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-09-10T22:00:00.000Z');
  });

  it('a member who handed it over that morning still held it that day', () => {
    expect(heldDuringDay([A, B], 'ahmed', NOON_10TH, VIE)).toBe(true);
    expect(heldDuringDay([A, B], 'ahmed', '2026-09-11T10:00:00Z', VIE)).toBe(false);
    expect(heldDuringDay([A, B], 'bea', '2026-09-09T10:00:00Z', VIE)).toBe(false);
  });

  it('the filer who held it that day is charged — never the holder at noon', () => {
    const slip = { occurredAt: NOON_10TH, amountCents: 5000, direction: 'OUT', authorId: 'ahmed' };
    expect(entryHolder(slip, [A, B], VIE)?.id).toBe('a');
    const { byPeriod } = totalsByPeriod([slip], [A, B], { timeZone: VIE });
    expect(byPeriod.get(A)!.outCents).toBe(5000);
    expect(byPeriod.get(B)!.outCents).toBe(0);
    expect(attribute([slip], [A, B], { timeZone: VIE })[0]!.heldBy?.id).toBe('a');
  });

  it('an office entry goes to the holder at its instant, else to who held it longest that day', () => {
    const office = { occurredAt: NOON_10TH, amountCents: 100, authorId: 'office' };
    expect(entryHolder(office, [A, B], VIE)?.id).toBe('b');
    const back: CustodyPeriod = { ...A, endedAt: '2026-09-10T08:00:00Z' }; // returned at 10:00, nobody after
    expect(entryHolder(office, [back], VIE)?.id).toBe('a');
    expect(entryHolder({ ...office, occurredAt: '2026-09-12T10:00:00Z' }, [back], VIE)).toBeNull();
  });
});
