import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/*
  There are TWO clock-in controls on the web — the navbar widget and the button
  on the shift page — and they were written twice. Each carried its own status
  query, its own locations query, its own geolocation error strings and its own
  rule for choosing a workspace: about eighty duplicated lines whose only
  difference was which copy had been fixed most recently.

  That is not a tidiness complaint. The workspace picker was added to the page
  and not to the navbar, so for one release the same member pressing "On-site"
  in the navbar was still silently clocked in at whichever site the GPS liked —
  the exact bug the picker existed to fix, still live, one component away.

  So: one hook owns the behaviour and the components render it. This test fails
  if a second implementation appears.
*/

const SRC = join(__dirname, '..');
const HOOK = join('hooks', 'use-clock-in.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.includes('__tests__') && !f.endsWith('api.ts'));

describe('clocking in has one implementation', () => {
  it('is called from the hook and nowhere else', () => {
    const callers = files
      .filter((f) => /attendanceApi\.(clockIn|clockOut)\b/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(SRC.length + 1))
      .filter((f) => f !== HOOK);

    expect(callers).toEqual([]);
  });

  it('asks for the workspaces the member may USE, not the ones they can see', () => {
    /*
      `getLocations` answers "what workspaces can I see" — and a manager can see
      the whole directory, so a site could be offered that the clock-in then
      refuses with "You are not assigned to this location", which reads to them
      as the product being broken.
    */
    const hook = readFileSync(join(SRC, HOOK), 'utf8');
    expect(hook).toContain('getClockInLocations');
    expect(hook).not.toContain('attendanceApi.getLocations');
  });

  it('chooses the workspace only through the shared rule, never by its own distance maths', () => {
    // The original bug: both surfaces measured distances and clocked in at the
    // nearest site without saying so. A choice is made now only where it is
    // certain (one workspace, or inside exactly one area) and only by
    // `chooseClockInLocation`, shared with the phone. Distance maths reappearing
    // next to a clock-in call is the smell.
    const hook = readFileSync(join(SRC, HOOK), 'utf8');
    expect(hook).toContain('chooseClockInLocation');
    expect(hook).not.toContain('distanceMeters');
    expect(hook).not.toContain('haversine');
  });

  it('opens the picker only when there is a choice', () => {
    const hook = readFileSync(join(SRC, HOOK), 'utf8');
    const start = hook.indexOf('const startClockIn');
    expect(start).toBeGreaterThan(-1);
    const body = hook.slice(start, hook.indexOf('setPickerOpen(true)', start) + 20);
    expect(body).toContain('locations.length === 1');
    expect(body).toContain('choice.kind === "auto"');
    expect(body).toContain('setPickerOpen(true)');
  });

  it('offers no remote-or-field choice to a member who has workspaces', () => {
    const widget = readFileSync(join(SRC, 'components', 'clock-widget.tsx'), 'utf8');
    const page = readFileSync(join(SRC, 'app', '(dashboard)', 'my', 'attendance', 'page.tsx'), 'utf8');
    for (const src of [widget, page]) {
      expect(src).not.toMatch(/startAway|awayPickerProps|clockInAway/);
    }
  });

  it('shows the same picker on both surfaces', () => {
    const widget = readFileSync(join(SRC, 'components', 'clock-widget.tsx'), 'utf8');
    const page = readFileSync(join(SRC, 'app', '(dashboard)', 'my', 'attendance', 'page.tsx'), 'utf8');
    for (const src of [widget, page]) {
      expect(src).toContain('useClockIn');
      expect(src).toContain('<ClockInPicker');
    }
  });
});
