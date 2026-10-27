import {
  DECISION_MINUTES_MAX,
  durationFieldsOf,
  durationInRange,
  durationMinutes,
  readDurationPart,
} from '../duration-input';

/* A decision's time as web and phone both read it: hours (decimal with a comma or a dot) + minutes, 1 min – 24 h. */
describe('duration input', () => {
  it('reads hours and minutes, decimal hours with a comma or a dot', () => {
    expect(durationMinutes({ h: '1', m: '30' })).toBe(90);
    expect(durationMinutes({ h: '1,5', m: '' })).toBe(90);
    expect(durationMinutes({ h: '1.5', m: '' })).toBe(90);
    expect(durationMinutes({ h: '', m: '' })).toBe(0);
  });

  it('refuses what it cannot read rather than guessing', () => {
    for (const v of ['abc', '-1', '1,2,3', '1.000', '1,000']) expect(readDurationPart(v)).toBeNull();
    expect(durationMinutes({ h: '1.000', m: '' })).toBeNull();
  });

  it('shows whole minutes back as the two fields', () => {
    expect(durationFieldsOf(90)).toEqual({ h: '1', m: '30' });
    expect(durationFieldsOf(120)).toEqual({ h: '2', m: '' });
    expect(durationFieldsOf(45)).toEqual({ h: '', m: '45' });
    expect(durationFieldsOf(Number.NaN)).toEqual({ h: '', m: '' });
  });

  it('a decision counts 1 min – 24 h, whole minutes', () => {
    expect(DECISION_MINUTES_MAX).toBe(1440);
    expect(durationInRange(1)).toBe(true);
    expect(durationInRange(1440)).toBe(true);
    for (const n of [0, 1441, 1.5, null]) expect(durationInRange(n)).toBe(false);
  });
});
