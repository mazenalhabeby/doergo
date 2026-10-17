/**
 * The pieces the DRY pass of 2026-10-11 pulled out of copy-pasted screens,
 * and the rule each one carries.
 *
 * Every one of these was written out two or three times; the copies agreed
 * then, and the next edit would have made them disagree. This pins that the
 * callers still go through the one piece, and that each piece kept what its
 * callers relied on. Source-level, like the other guards here — rendering
 * tests are a separate decision (see jest.config.js).
 */
import * as fs from 'fs';
import * as path from 'path';
import { readSource } from '../../test-utils/read-source';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const read = (rel: string) => strip(readSource(path.join(ROOT, rel), 'utf8'));

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}
const ALL = ['src', 'app'].flatMap((d) => [...walk(path.join(ROOT, d))]).map((f) => path.relative(ROOT, f));
/** Files (outside `owner`) whose source matches `re`. */
const copiesOf = (re: RegExp, owner: string[]) => ALL.filter((f) => !owner.includes(f) && re.test(read(f)));

it('reads the app (a sweep that matched nothing would pass everything)', () => {
  expect(ALL.length).toBeGreaterThan(200);
  expect(copiesOf(/damping: 25, stiffness: 200/, [])).toContain('src/components/slide-sheet.tsx');
});

describe('the card sheet (slide-sheet.tsx)', () => {
  const callers = ['src/components/confirm-sheet.tsx', 'src/components/out-of-ring-sheet.tsx', 'src/components/always-location-sheet.tsx'];

  it.each(callers)('%s draws through SlideSheet, with no Modal or animation of its own', (f) => {
    const src = read(f);
    expect(src).toMatch(/<SlideSheet\s/);
    expect(src).toMatch(/useSlideSheet\(visible/);
    expect(src).not.toMatch(/<Modal\b/);
    expect(src).not.toMatch(/Animated\./);
  });

  it('the out-of-ring sheet still drops the keyboard on close and rides above it', () => {
    const src = read('src/components/out-of-ring-sheet.tsx');
    expect(src).toMatch(/useSlideSheet\(visible, \{ dismissKeyboard: true \}\)/);
    expect(src).toMatch(/<SlideSheet[^>]*\savoidKeyboard\b/);
  });

  it('the sheet caps match what each one had', () => {
    expect(read('src/components/out-of-ring-sheet.tsx')).toMatch(/maxHeightFraction=\{0\.85\}/);
    expect(read('src/components/always-location-sheet.tsx')).toMatch(/maxHeightFraction=\{0\.9\}/);
    expect(read('src/components/confirm-sheet.tsx')).not.toMatch(/maxHeightFraction/);
  });

  it('Cancel is held only while loading; the confirm by whatever the caller says', () => {
    const src = read('src/components/slide-sheet.tsx');
    expect(src).toMatch(/onPress=\{onCancel\}\s+disabled=\{isLoading\}/);
    expect(src).toMatch(/onPress=\{onConfirm\}\s+disabled=\{disabled\}/);
    // Out of ring: an empty reason greys it out, as before.
    expect(read('src/components/out-of-ring-sheet.tsx')).toMatch(/disabled=\{!canConfirm \|\| isLoading\}/);
  });

  it('nobody else writes the slide-up spring out by hand (BlurSheet and the job page aside)', () => {
    expect(copiesOf(/damping: 25, stiffness: 200/, [
      'src/components/slide-sheet.tsx', 'src/components/blur-sheet.tsx', 'src/components/job/job-page.tsx',
    ])).toEqual([]);
  });
});

describe('one copy of each small part', () => {
  it('the receipt line (ReceiptRow, job-ui)', () => {
    expect(copiesOf(/fontSize: strong \? 16 : 13\.5/, ['src/components/job/job-ui.tsx', 'src/components/job/sheet-option.tsx'])).toEqual([]);
  });

  it('the date tile (DateTileRow)', () => {
    expect(copiesOf(/width: 44, height: 44, borderRadius: 14, backgroundColor: c\.tile/, ['src/components/time/date-tile-row.tsx'])).toEqual([]);
  });

  it('the month arrows (DayPickerTop)', () => {
    expect(copiesOf(/\$\{months\?\.\[/, ['src/components/new-job/day-picker-parts.tsx'])).toEqual([]);
  });

  it.each(['src/components/clock-out-sheet.tsx', 'src/components/break-sheet.tsx'])('%s ends with the shift-sheet footer', (f) => {
    const src = read(f);
    expect(src).toMatch(/<SheetConfirmFooter\b/);
    expect(src).not.toMatch(/shiftEnd\.notYet/);
    expect(src).not.toMatch(/backgroundColor: c\.accentSolid/);
  });

  it('the camera of a send-it-in screen (CaptureCamera)', () => {
    expect(copiesOf(/shutterInner/, [
      'src/components/equipment/capture-camera.tsx',
      // Their own viewfinders, with a frame to fill — not this one.
      'src/components/document-scanner.tsx', 'src/components/document-scanner-helpers.tsx', 'src/components/scan-card/card-camera.tsx',
    ])).toEqual([]);
  });

  it('the glass field (amazen/filter.tsx)', () => {
    expect(copiesOf(/backgroundColor: c\.glass, borderWidth: 1, borderColor: c\.lineGlass, borderRadius: 16/, ['src/components/amazen/filter.tsx'])).toEqual([]);
  });

  it.each(['src/components/people/members-screen.tsx', 'src/components/people/team-screen.tsx'])('%s draws no pill of its own', (f) => {
    expect(read(f)).not.toMatch(/backgroundColor: on \? c\.accentTint : c\.tile/);
  });
});

describe('the parts kept what their callers relied on', () => {
  it('the receipt asks for the palette\'s label colour; the agreement keeps white', () => {
    expect(read('app/(app)/asset-expense.tsx')).toMatch(/sendLabelColor=\{COLORS\.onPrimary\}/);
    expect(read('app/(app)/send-document.tsx')).not.toMatch(/sendLabelColor=/);
  });

  it('the receipt camera is titled; the agreement\'s hint is the wide one', () => {
    expect(read('app/(app)/asset-expense.tsx')).toMatch(/<CaptureCamera[\s\S]*?title=/);
    expect(read('app/(app)/send-document.tsx')).toMatch(/<CaptureCamera[\s\S]*?wideHint/);
  });

  it('only the New-job day sheet closes the months before this one', () => {
    expect(read('src/components/new-job/when-sheets.tsx')).toMatch(/<DayPickerTop[\s\S]*?prevDisabled=\{atStart\}/);
    expect(read('src/components/job/sheets/step-form-sheet.tsx')).not.toMatch(/prevDisabled/);
  });

  it('Members and Team keep their pills whole (ChoicePill, not the capped FilterPill)', () => {
    for (const f of ['src/components/people/members-screen.tsx', 'src/components/people/team-screen.tsx']) {
      const src = read(f);
      expect(src).toMatch(/<ChoicePill\b/);
      expect(src).toMatch(/<GlassInput\b/);
    }
    const filter = read('src/components/amazen/filter.tsx');
    const choice = filter.slice(filter.indexOf('export function ChoicePill'), filter.indexOf('type Amazen'));
    expect(choice).not.toMatch(/maxWidth|numberOfLines/);
  });

  it('Edit profile saves only a change; Change password whenever it is valid', () => {
    expect(read('app/(customer)/edit-profile.tsx')).toMatch(/canSave=\{valid && dirty\}/);
    expect(read('app/(customer)/change-password.tsx')).toMatch(/canSave=\{valid\}/);
  });
});
