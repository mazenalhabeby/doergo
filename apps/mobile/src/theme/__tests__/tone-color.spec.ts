import { AMAZEN_DARK, AMAZEN_LIGHT } from '../amazen';
import { toneColor, toneTint } from '../tone-color';

/*
  toneColor/toneTint replaced a dozen nested ternaries; each call site passes the
  colour its last branch fell back to. Pinned in both themes: the four tones and
  the fallback for anything else.
*/
describe.each([
  ['dark', AMAZEN_DARK.color],
  ['light', AMAZEN_LIGHT.color],
])('tone colours (%s)', (_name, c) => {
  it('maps critical (and the strip’s "crit"), warn and accent; anything else is the fallback', () => {
    expect(toneColor(c, 'critical', 'x')).toBe(c.critical);
    expect(toneColor(c, 'crit', 'x')).toBe(c.critical);
    expect(toneColor(c, 'warn', 'x')).toBe(c.warn);
    expect(toneColor(c, 'accent', 'x')).toBe(c.accent);
    for (const other of ['muted', 'calm', 'strong', 'neutral', undefined, null])
      expect(toneColor(c, other, 'x')).toBe('x');
  });

  it('tints the same tones', () => {
    expect(toneTint(c, 'critical', 'x')).toBe(c.criticalTint);
    expect(toneTint(c, 'crit', 'x')).toBe(c.criticalTint);
    expect(toneTint(c, 'warn', 'x')).toBe(c.warnTint);
    expect(toneTint(c, 'accent', 'x')).toBe(c.accentTint);
    expect(toneTint(c, 'muted', 'x')).toBe('x');
  });
});
