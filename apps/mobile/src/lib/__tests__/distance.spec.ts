import {
  formatDistance,
  distanceParts,
  distanceRefusalParams,
  DISTANCE_UNKNOWN,
} from '@hbcfield/shared/client';

/**
 * The ONE distance formatter (packages/shared/src/utils/distance.ts).
 *
 * It exists because a member tapped "Arrived" in the wrong country and read
 * "You are 9630871m from the job site". Every screen and every server sentence
 * now says a distance through this, so the rules are pinned here once.
 */

const NB = ' ';
const en = (m: number | null | undefined, o = {}) => formatDistance(m, { locale: 'en', ...o }).replace(NB, ' ');

describe('formatDistance — the rules', () => {
  it('whole metres below 100', () => {
    expect(en(0)).toBe('0 m');
    expect(en(7.4)).toBe('7 m');
    expect(en(85)).toBe('85 m');
    expect(en(99)).toBe('99 m');
  });

  it('nearest 10 m from 100 to a kilometre', () => {
    expect(en(100)).toBe('100 m');
    expect(en(104)).toBe('100 m');
    expect(en(856)).toBe('860 m');
    expect(en(994)).toBe('990 m');
  });

  it('rounds BEFORE choosing the unit — never "1,000 m"', () => {
    expect(en(999)).toBe('1 km');
    expect(en(995)).toBe('1 km');
    expect(en(99.6)).toBe('100 m');
  });

  it('one decimal from 1 to 10 km, ".0" dropped', () => {
    expect(en(1000)).toBe('1 km');
    expect(en(1234)).toBe('1.2 km');
    expect(en(3000)).toBe('3 km');
    expect(en(9949)).toBe('9.9 km');
  });

  it('whole km from 10 km — including 9.95 km, which rounds up into that band', () => {
    expect(en(9999)).toBe('10 km');
    expect(en(10000)).toBe('10 km');
    expect(en(12345)).toBe('12 km');
    expect(en(99999)).toBe('100 km');
  });

  it('whole km, grouped, from 100 km — the bug that started this', () => {
    expect(en(100000)).toBe('100 km');
    expect(en(9630871)).toBe('9,631 km');
    expect(formatDistance(9630871, { locale: 'de' })).toBe(`9.631${NB}km`);
  });

  it('joins number and unit with a no-break space', () => {
    expect(formatDistance(850)).toBe(`850${NB}m`);
    expect(formatDistance(1234)).toBe(`1.2${NB}km`);
  });
});

describe('formatDistance — languages', () => {
  it.each([
    ['en', '1.2'],
    ['de', '1,2'],
    ['es', '1,2'],
    ['fr', '1,2'],
    ['it', '1,2'],
  ])('%s writes the decimal its own way', (locale, n) => {
    expect(formatDistance(1234, { locale })).toBe(`${n}${NB}km`);
  });

  it('reads a region-tagged locale and falls back to English for an unknown one', () => {
    expect(formatDistance(1234, { locale: 'de-AT' })).toBe(`1,2${NB}km`);
    expect(formatDistance(1234, { locale: 'xx' })).toBe(`1.2${NB}km`);
    expect(formatDistance(1234, { locale: null })).toBe(`1.2${NB}km`);
  });
});

describe('formatDistance — options and bad input', () => {
  it('approx prefixes "~"', () => {
    expect(en(1700, { approx: true })).toBe('~1.7 km');
    expect(en(85, { approx: true })).toBe('~85 m');
  });

  it('a forced unit keeps the band rounding', () => {
    expect(en(1250, { unit: 'm' })).toBe('1,250 m');
    expect(en(300, { unit: 'km' })).toBe('0.3 km');
  });

  it.each([null, undefined, NaN, -1, Infinity])('%p reads as "—"', (bad) => {
    expect(formatDistance(bad as number)).toBe(DISTANCE_UNKNOWN);
    expect(distanceParts(bad as number)).toBeNull();
  });
});

describe('distanceParts — same rules, for a big number and a small unit', () => {
  it.each([
    [85, 85, 'm', '85'],
    [850, 850, 'm', '850'],
    [999, 1, 'km', '1'],
    [1234, 1.2, 'km', '1.2'],
    [12345, 12, 'km', '12'],
    [9630871, 9631, 'km', '9,631'],
  ])('%p m → %p %s', (metres, value, unit, text) => {
    expect(distanceParts(metres, { locale: 'en' })).toEqual({ value, unit, text });
  });

  it('agrees with formatDistance, and carries "~"', () => {
    for (const m of [0, 99, 100, 999, 1000, 9999, 10000, 99999, 100000]) {
      const p = distanceParts(m)!;
      expect(`${p.text}${NB}${p.unit}`).toBe(formatDistance(m));
    }
    expect(distanceParts(1700, { approx: true })?.text).toBe('~1.7');
  });
});

describe('distanceRefusalParams — a coded refusal, written for the reader', () => {
  it('formats the two figures a distance refusal carries', () => {
    expect(distanceRefusalParams({ distanceMetres: 9630871, radiusMetres: 100 }, 'de')).toEqual({
      distance: `9.631${NB}km`,
      radius: `100${NB}m`,
    });
  });

  it('never leaves a placeholder unfilled', () => {
    expect(distanceRefusalParams(undefined)).toEqual({ distance: DISTANCE_UNKNOWN, radius: DISTANCE_UNKNOWN });
  });
});
