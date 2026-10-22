import { closingLabelColumns } from '../clock-out/clock-out-helpers';
import { clockOutLabelSpec } from '../clock-out/clock-out-steps';
import { closedHowOfBasis } from '../core/open-shift-close';

/** How a shift closed, recorded in the label facts — for new entries only. */
const facts = { shift: null, firstOfShift: true, clockIn: { judged: true, metresOutside: 0 } };
const base = { id: 'e1', userId: 'u1', organizationId: 'o1', clockInAt: new Date('2026-10-18T06:00:00Z') };
const site = { lat: 47.9813, lng: 13.8269, geofenceRadius: 50, geofencePolygon: null };

describe('label facts at the close', () => {
  it('an old entry (no labelRules) gets nothing written — the past is not touched', () => {
    expect(closingLabelColumns({ ...base, labelRules: null, labelFacts: null }, { closedHow: 'CLOCKED_OUT' })).toEqual(
      {},
    );
  });

  it('a new entry records how it closed, keeping the clock-in facts', () => {
    const cols = closingLabelColumns({ ...base, labelRules: 1, labelFacts: facts }, { closedHow: 'LAST_SEEN' });
    expect(cols).toEqual({ labelFacts: { ...facts, closedHow: 'LAST_SEEN' } });
  });

  it('no labels passed: nothing written', () => {
    expect(closingLabelColumns({ ...base, labelRules: 1, labelFacts: facts }, undefined)).toEqual({});
  });

  it.each([
    ['LEFT_SITE', 'LEFT_SITE'],
    ['LAST_SEEN', 'LAST_SEEN'],
    ['SHIFT_END', 'SHIFT_END'],
    ['CLOCK_IN_PLUS_8H', 'SESSION_HOURS'],
  ])('a temporary close based on %s is recorded as %s', (basis, how) => {
    expect(closedHowOfBasis(basis)).toBe(how);
  });
});

describe('the clock-out position for the facts', () => {
  it('on site', () => {
    expect(clockOutLabelSpec({ location: site }, { lat: 47.9813, lng: 13.8269, accuracy: 8 }, false)).toEqual({
      closedHow: 'CLOCKED_OUT',
      clockOut: { judged: true, metresOutside: 0, accuracyM: 8 },
    });
  });
  it('a 2 km fix is not judged — the old rule counted it as on site', () => {
    const r = clockOutLabelSpec({ location: site }, { lat: 48.2, lng: 16.37, accuracy: 2000 }, false);
    expect(r.clockOut).toEqual({ judged: false, notJudgedBecause: 'TOO_COARSE', accuracyM: 2000 });
  });
  it('an away day and an automatic clock-out are not judged', () => {
    expect(
      clockOutLabelSpec({ isRemote: true, location: site }, { lat: 48.2, lng: 16.37 }, false).clockOut.notJudgedBecause,
    ).toBe('AWAY_DAY');
    const auto = clockOutLabelSpec({ location: site }, { lat: 48.2, lng: 16.37 }, true);
    expect(auto).toEqual({
      closedHow: 'AUTO_CLOCK_OUT',
      clockOut: { judged: false, notJudgedBecause: 'AUTO_CLOCK_OUT' },
    });
  });
});
