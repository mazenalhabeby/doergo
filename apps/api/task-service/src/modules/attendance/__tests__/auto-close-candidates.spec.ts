/**
 * The automatic close reads only rows already ELIGIBLE (auto-close-candidates.ts): rows never due at the
 * head of the order used to fill BATCH × 5 and starve the due ones behind them.
 */
import { OPEN_SHIFT_CLOSE } from '@hbcfield/shared';
import { autoShiftsPastEnd, presencePastHours } from '../clock-out/auto-close-candidates';

/** The whole statement as text, nested fragments included ($n placeholders for values). */
function sqlOf(call: any[]): { text: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  const walk = (strings: readonly string[], vals: unknown[]) => {
    strings.forEach((s, i) => {
      parts.push(s);
      if (i >= vals.length) return;
      const v: any = vals[i];
      if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.strings)) walk(v.strings, v.values ?? []);
      else {
        values.push(v);
        parts.push('?');
      }
    });
  };
  walk(call[0], call.slice(1));
  return { text: parts.join(''), values };
}

const now = new Date('2026-10-29T12:00:00Z');
const run = async (fn: typeof autoShiftsPastEnd) => {
  const $queryRaw = jest.fn().mockResolvedValue([]);
  await fn({ $queryRaw } as any, now);
  return sqlOf($queryRaw.mock.calls[0]);
};

describe('the automatic close asks eligibility in the query', () => {
  for (const [name, fn] of [['by shift', autoShiftsPastEnd], ['by presence', presencePastHours]] as const) {
    it(`${name}: only automatic members (workspace on, chosen, consent, not external), one batch`, async () => {
      const { text, values } = await run(fn);
      expect(text).toContain(`(l."autoClock"->>'enabled') = 'true'`);
      expect(text).toContain('sa."autoClock" = true');
      expect(text).toContain('u."autoClockConsentAt" IS NOT NULL');
      expect(text).toContain('u."isExternal" = false');
      expect(text).toContain('l."isRemote" = false');
      // The workspace's own closeAfterMinutes, not the shortest any workspace may set.
      expect(text).toContain(`l."autoClock"->>'closeAfterMinutes'`);
      expect(text).toMatch(/LIMIT \?$/);
      expect(values.at(-1)).toBe(OPEN_SHIFT_CLOSE.BATCH);
    });
  }

  it('by shift: never somebody still reported ON SITE within the workspace’s time; never a daily-limit marker', async () => {
    const { text } = await run(autoShiftsPastEnd);
    expect(text).toContain(`NOT (te."presence" = 'ON_SITE'`);
    expect(text).toContain('te."endIsDailyLimit" = false');
  });

  it('by presence: LIMIT workspaces too (the end is only the marker), at the member’s own hours', async () => {
    const { text } = await run(presencePastHours);
    expect(text).toContain('(te."expectedClockOutAt" IS NULL OR te."endIsDailyLimit" = true)');
    expect(text).toContain(`a."autoClockMode" = 'PRESENCE'`);
    expect(text).toContain('COALESCE(a."workDailyMinutes", l."noShiftDailyMinutes"');
  });
});
