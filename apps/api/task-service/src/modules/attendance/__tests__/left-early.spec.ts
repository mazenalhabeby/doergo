import { shortfallMinutes } from '@hbcfield/shared';

/**
 * Leaving before the shift ends.
 *
 * The rule itself is one shared function, tested here from the angle that
 * matters operationally: what counts as "short", and what the system does about
 * it. The answer to the second is deliberately narrow — it asks, it records, it
 * tells somebody, and it never refuses. A time system that blocks a clock-out is
 * a time system people work around, and then it records nothing at all.
 */
describe('leaving early', () => {
  const at = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00.000Z`);
  const END = at('18:00');

  it('is measured against the shift end, in whole minutes', () => {
    expect(shortfallMinutes({ clockOutAt: at('16:40'), expectedEndAt: END })).toBe(80);
  });

  it('ignores a few minutes inside the tolerance — the same tolerance as the flags', () => {
    expect(shortfallMinutes({ clockOutAt: at('17:52'), expectedEndAt: END, toleranceMin: 10 })).toBe(0);
    expect(shortfallMinutes({ clockOutAt: at('17:45'), expectedEndAt: END, toleranceMin: 10 })).toBe(15);
  });

  it('is nothing at all when there was no shift to fall short of', () => {
    // Task work and flexible spaces: there is no expectation, so there can be no
    // shortfall, and asking somebody why they stopped would be a nonsense.
    expect(shortfallMinutes({ clockOutAt: at('14:00') })).toBe(0);
  });

  it('is nothing when they worked past the end', () => {
    expect(shortfallMinutes({ clockOutAt: at('19:15'), expectedEndAt: END })).toBe(0);
  });

  it('survives a night shift, because it compares instants and not clock faces', () => {
    expect(
      shortfallMinutes({
        clockOutAt: new Date('2026-09-07T04:30:00Z'),
        expectedEndAt: new Date('2026-09-07T06:00:00Z'),
      }),
    ).toBe(90);
  });
});
