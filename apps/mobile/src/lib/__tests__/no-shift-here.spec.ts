import { noShiftHere, type PlaceTile } from '../../features/time/time-logic';

/*
  The Time page speaks of ONE workspace's no-shift rule — the one the member is
  at. It stacked a banner for every workspace with a limit: ten workspaces, ten
  banners, the clock card pushed off the screen.
*/
const now = new Date('2026-10-14T10:00:00Z');
const tag = (workedTodayMinutes: number, dailyMinutes: number) => ({
  policy: 'LIMIT' as const, dailyMinutes, hasShiftNow: false, workedTodayMinutes, dayEndsAt: '2026-10-14T22:00:00Z',
});
const tile = (id: string, relation: PlaceTile['relation'], noShift: Record<string, unknown> | null): PlaceTile =>
  ({ location: { id, name: id, noShift } as never, relation, metres: null });

describe('the one no-shift line on the Time page', () => {
  it('speaks of the workspace they are at, whatever the others say', () => {
    const tiles = [tile('office', 'here', tag(558, 480)), ...Array.from({ length: 9 }, (_, i) => tile(`w${i}`, 'away', tag(558, 720)))];
    const note = noShiftHere(tiles, false, now);
    expect(note?.location.id).toBe('office');
    expect(note?.allowance).toMatchObject({ kind: 'refused', reason: 'NO_HOURS_LEFT' });
  });

  it('says nothing when they are at none of them', () => {
    expect(noShiftHere([tile('a', 'away', tag(0, 480)), tile('b', 'away', tag(0, 480))], false, now)).toBeNull();
  });

  it('a member with one workspace hears about it wherever they are', () => {
    expect(noShiftHere([tile('only', 'away', tag(300, 480))], false, now)).toMatchObject({ allowance: { kind: 'limited', remainingMinutes: 180 } });
  });

  it('says nothing while clocked in, or where the workspace allows it freely', () => {
    expect(noShiftHere([tile('office', 'here', tag(558, 480))], true, now)).toBeNull();
    expect(noShiftHere([tile('office', 'here', null)], false, now)).toBeNull();
  });

  it('agreed overtime raises the limit', () => {
    expect(noShiftHere([tile('office', 'here', { ...tag(480, 480), extraMinutes: 60 })], false, now))
      .toMatchObject({ allowance: { kind: 'limited', remainingMinutes: 60 } });
  });
});
