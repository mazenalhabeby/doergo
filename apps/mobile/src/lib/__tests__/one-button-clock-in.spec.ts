/**
 * The phone's clock-in is one button: the workspace is chosen only when it is
 * certain, only by the rule the web shares, and nobody is asked "remote or
 * field" — that is decided from evidence afterwards.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('one-button clock-in on the phone', () => {
  it('chooses through the shared rule, and measures no distances of its own', () => {
    const hook = read('src/hooks/useClockIn.ts');
    expect(hook).toContain('chooseClockInLocation');
    const flow = hook.slice(hook.indexOf('const openClockInModal'), hook.indexOf('const confirmClockIn'));
    expect(flow).toContain("choice.kind === 'auto'");
    expect(flow).not.toMatch(/haversine/i);
  });

  it('offers no "work remotely" choice in the sheet, and orders it the shared way', () => {
    const sheet = read('src/components/location-picker-sheet.tsx');
    expect(sheet).toContain('rankClockInLocations');
    expect(sheet).not.toMatch(/allowRemote|onSelectRemote|Work remotely/);
  });
});
