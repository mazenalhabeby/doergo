import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * A bottom sheet must not draw its own surface.
 *
 * `BlurSheet` owns the modal, the backdrop and the animation, and says so —
 * "callers just provide their own sheet content". Four callers then wrote the
 * same surface by hand, and three of them wrote it with a flat bottom padding:
 *
 *     paddingBottom: 28
 *
 * which is a guess at the home indicator and simply wrong for the Android
 * navigation bar. On a three-key Android phone the last row of the More sheet
 * sat behind the keys. It looks like a design choice in a screenshot, and it
 * is invisible on any device whose bottom inset happens to be small.
 *
 * `SheetPanel` already solved it — `insets.bottom + SPACING.md`, once. So the
 * rule is that a sheet's content IS a SheetPanel, and the exemptions have to
 * prove they handle the inset themselves.
 */

const ROOT = process.cwd();

/** Every file that presents a BlurSheet. */
function sheetFiles(): string[] {
  const out = execSync('grep -rl --include=*.tsx "<BlurSheet" app src', { cwd: ROOT })
    .toString()
    .trim();
  return out ? out.split('\n') : [];
}

/**
 * Sheets written before SheetPanel existed. They are exempt from using it, NOT
 * from clearing the system bar — the assertion below still holds them to it.
 * Nothing new belongs on this list; convert it instead.
 */
const HAND_ROLLED: Record<string, string> = {
  'app/(app)/(tabs)/attendance.tsx':
    'the break and forgot-to-clock-out sheets predate SheetPanel; both apply insets.bottom themselves',
};

describe('bottom sheets use the shared surface', () => {
  const files = sheetFiles();

  it('finds the sheets it means to check (an empty sweep would pass anything)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('every sheet renders a SheetPanel, or is a named exemption', () => {
    const bad = files.filter(
      (f) => !HAND_ROLLED[f] && !fs.readFileSync(path.join(ROOT, f), 'utf8').includes('<SheetPanel'),
    );
    expect(bad).toEqual([]);
  });

  it('every exemption still clears the system bar itself', () => {
    const bad: string[] = [];
    for (const [file, reason] of Object.entries(HAND_ROLLED)) {
      expect(reason.length).toBeGreaterThan(20); // a reason, not a placeholder
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      if (!/insets\.bottom/.test(src)) bad.push(`${file} is exempt but never reads insets.bottom`);
    }
    expect(bad).toEqual([]);
  });

  it('names no exemption that no longer presents a sheet', () => {
    expect(Object.keys(HAND_ROLLED).filter((f) => !files.includes(f))).toEqual([]);
  });
});

describe('the shared surface is the thing that clears the system bar', () => {
  it('SheetPanel pads by the bottom inset', () => {
    // If this ever becomes a constant, every sheet in the app loses its floor
    // at once and no individual screen looks responsible for it.
    const src = fs.readFileSync(path.join(ROOT, 'src/components/sheet-panel.tsx'), 'utf8');
    expect(src).toMatch(/paddingBottom:\s*insets\.bottom/);
  });
});
