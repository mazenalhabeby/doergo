import * as fs from 'fs';
import * as path from 'path';
import { totalsRevision } from '../../features/home/shift-state';
import { readSource } from '../../test-utils/read-source';

/*
  ⑥ "Done for today" showed the shift BEFORE the one just clocked out: the
  totals were asked at the tap, before the queued clock-out reached the
  server, and nothing asked again once it landed.
*/
describe('totalsRevision', () => {
  const out = { isClockedIn: false, currentEntry: null };

  it('changes when a queued shift change finishes sending', () => {
    expect(totalsRevision(out, true)).not.toBe(totalsRevision(out, false));
  });

  it('changes on and off the clock, and with the entry', () => {
    expect(totalsRevision({ isClockedIn: true, currentEntry: { id: 'a' } }, false)).not.toBe(totalsRevision(out, false));
    expect(totalsRevision({ isClockedIn: true, currentEntry: { id: 'a' } }, false)).not.toBe(
      totalsRevision({ isClockedIn: true, currentEntry: { id: 'b' } }, false),
    );
  });

  it('is the ONE key — the Time page and the home card both read it', () => {
    for (const file of ['features/time/time-screen.tsx', 'features/home/shift-clock-card.tsx']) {
      const code = readSource(path.join(__dirname, '../..', file), 'utf8');
      expect(code).toMatch(/revision:\s*totalsRevision\(/);
    }
  });
});
