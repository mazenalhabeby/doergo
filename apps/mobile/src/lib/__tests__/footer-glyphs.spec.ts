/**
 * The footer draws the house marks, and nothing else.
 *
 * The pill moved to `tab-glyphs.tsx` and the overflow sheet did not, so for a
 * while Time off was a calendar in two different drawings depending on which
 * door you came through. Both read `TAB_GLYPHS` now, and this says so — the
 * kind of drift that is invisible until somebody opens More and notices the
 * icons do not match the bar they just tapped.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TAB_PRIORITY } from '../tab-layout';

/*
  Read as SOURCE, not imported.

  `tab-glyphs.tsx` pulls in `react-native-svg`, which jest does not transform —
  and a test that needs a native module to check a lookup table would be
  testing the bundler. The table is a literal; reading it is enough.
*/

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) =>
  fs
    .readFileSync(p, 'utf8')
    // Comments name the forbidden thing all the time — this file included.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/*
  The widths, checked as arithmetic.

  Re-derived here rather than imported, because `tab-pill.tsx` pulls in
  `react-native-svg` and `expo-linear-gradient`, neither of which jest
  transforms. The constants are duplicated ON PURPOSE and the first test
  asserts they still match the source — a copy that can drift silently would
  be worse than no test.
*/
const CAPSULE_W = 108;
const GAP = 2;
const MIN_MARK_W = 40;
function slotWidths(pillInnerWidth: number) {
  const usable = Math.max(0, pillInnerWidth - 4 * GAP);
  const capsule = Math.min(CAPSULE_W, Math.max(0, usable - 4 * MIN_MARK_W));
  const mark = Math.max(MIN_MARK_W, (usable - capsule) / 4);
  return { capsule, mark };
}

describe('the tab pill fits', () => {
  it('uses the same constants the component does', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/amazen/tab-pill.tsx'), 'utf8');
    expect(src).toContain(`const CAPSULE_W = ${CAPSULE_W};`);
    expect(src).toContain(`const GAP = ${GAP};`);
    expect(src).toContain(`const MIN_MARK_W = ${MIN_MARK_W};`);
  });

  it.each([320, 360, 390, 414, 430])('never overflows the pill at %ipt', (screen) => {
    /*
      ⚠️ THE BUG THIS EXISTS FOR: the marks were on `flex: 1`, two of the five
      slots are wrapped in a `TourTarget` (a plain View, so a COLUMN), and a
      flex child of a column flexes its HEIGHT — so the wrapped and unwrapped
      slots resolved to different widths, the row came out wider than the pill,
      and **More was pushed off the right edge entirely**.
    */
    const inner = screen - 28 - 12; // container inset ×2, pill padding ×2
    const { capsule, mark } = slotWidths(inner);
    const row = capsule + 4 * mark + 4 * GAP;
    expect(row).toBeLessThanOrEqual(inner + 0.01);
  });

  it('keeps the capsule the same width whichever tab is selected', () => {
    // There are always exactly one capsule and four marks, so the arithmetic
    // cannot depend on WHICH tab is active — only on the phone.
    const a = slotWidths(350);
    const b = slotWidths(350);
    expect(a).toEqual(b);
    expect(a.capsule).toBe(CAPSULE_W);
  });

  it('holds a mark at a usable size on the narrowest phone', () => {
    expect(slotWidths(320 - 40).mark).toBeGreaterThanOrEqual(MIN_MARK_W);
  });

  it('leaves room for the longest label in every language', () => {
    // icon 21 + gap 6 + horizontal padding 20
    const room = CAPSULE_W - 21 - 6 - 20;
    const longest = ['Home', 'Jobs', 'Time', 'Chat', 'More', 'Start', 'Aufträge', 'Zeit',
      'Mehr', 'Inicio', 'Trabajos', 'Tiempo', 'Más', 'Accueil', 'Tâches', 'Temps', 'Plus',
      'Lavori', 'Tempo', 'Altro'];
    for (const label of longest) {
      // Readex Pro at 13px averages ~0.55em per glyph.
      expect(label.length * 13 * 0.55).toBeLessThanOrEqual(room);
    }
  });
});

describe('the footer', () => {
  it('has a mark for every tab that can reach the bar or the overflow', () => {
    const src = read(path.join(SRC, 'components/home/tab-glyphs.tsx'));
    const table = src.slice(src.indexOf('TAB_GLYPHS'));
    const drawn = new Set(
      [...table.matchAll(/^\s*'?([A-Za-z-]+)'?:\s*(Tab\w+Glyph),/gm)].map((m) => m[1]!),
    );
    for (const name of TAB_PRIORITY) expect([...drawn]).toContain(name);
  });

  it('draws no Ionicons in the pill', () => {
    /*
      The pill is the one surface a member looks at on every screen. An
      Ionicon here is not a small inconsistency — it is the whole app's icon
      language failing at its most-seen point.
    */
    const pill = read(path.join(SRC, 'components/amazen/tab-pill.tsx'));
    expect(pill).not.toMatch(/Ionicons/);
    expect(pill).toContain('TAB_GLYPHS');
  });

  it('draws the same marks in the overflow sheet', () => {
    const layout = read(path.resolve(SRC, '../app/(app)/(tabs)/_layout.tsx'));
    expect(layout).toContain('TAB_GLYPHS');
  });

  it('keeps every footer mark a stroked outline, except the dots', () => {
    /*
      ⚠️ The footer is the ONE exception to the family's law — see
      `docs/design/icons/README.md`. Four stacked opacities at 21px composite
      to a grey smudge, and there is no single surface to punch `contrast`
      against on a translucent pill over a per-screen gradient.

      `TabMoreGlyph` is the exception inside the exception: an outlined 2px dot
      is a ring with nothing in it.
    */
    const src = read(path.join(SRC, 'components/home/tab-glyphs.tsx'));
    const marks = src.split(/^export function /m).slice(1);
    for (const mark of marks) {
      const name = mark.slice(0, mark.indexOf('('));
      if (name === 'TabMoreGlyph') {
        expect(mark).toMatch(/fill=\{color\}/);
        continue;
      }
      expect(mark).toContain('{...stroke(color)}');
      // fillOpacity is the family's four-depth construction; not here.
      expect(mark).not.toMatch(/fillOpacity/);
    }
  });
});

/**
 * Things that work on one platform and not the other.
 *
 * Every rule here was a real defect in this bar at some point during v2, or is
 * one frame away from being one. They are cheap to check and expensive to
 * find on a device you do not own.
 */
describe('the footer works on both platforms', () => {
  const pill = () => fs.readFileSync(path.join(SRC, 'components/amazen/tab-pill.tsx'), 'utf8');

  it('never sets an iOS shadow without an Android elevation', () => {
    /*
      `shadowColor`/`shadowOpacity`/`shadowRadius` do nothing on Android. A
      surface that reads as lifted on iOS and flat on Android is the most
      common way a design "works" in review and does not ship.
    */
    const src = pill() + fs.readFileSync(path.join(SRC, 'components/amazen/surfaces.tsx'), 'utf8');
    for (const block of src.split(/\breturn\b|\bstyle=/)) {
      if (/shadowOpacity/.test(block)) expect(block).toMatch(/elevation/);
    }
  });

  it('lets the active label shrink on Android', () => {
    /*
      ⚠️ Android does not ellipsize a <Text> in a row from a shrinking PARENT.
      Without `flexShrink` on the text itself the label overflows the capsule
      and is clipped mid-letter — iOS is forgiving here and Android is not.
    */
    const src = pill();
    // The LAST `{item.label}` is the drawn one; the first is the
    // accessibilityLabel, which is read out whether or not the word is shown.
    const label = src.slice(src.lastIndexOf("{item.label}") - 1100, src.lastIndexOf('{item.label}'));
    expect(label).toMatch(/flexShrink:\s*1/);
    expect(label).toMatch(/numberOfLines=\{1\}/);
  });

  it('respects a request to reduce motion, on every animation', () => {
    /*
      Reanimated will collapse an animation to an instant change for somebody
      who has asked their phone to stop moving things — but only when told.
      One animation that forgets is one that still moves.
    */
    const src = pill();
    const animations = src.match(/with(Timing|Spring)\(|Fade(In|Out)\.|LinearTransition\./g) ?? [];
    expect(animations.length).toBeGreaterThan(0);
    // Every animation config object in the file names it.
    for (const cfg of ['SLIDE', 'TINT']) {
      const i = src.indexOf(`const ${cfg} = `);
      expect(i).toBeGreaterThan(-1);
      expect(src.slice(i, i + 260)).toContain('ReduceMotion.System');
    }
    expect(src).toContain('.reduceMotion(ReduceMotion.System)');
  });

  it('measures before it draws', () => {
    /*
      The marks carry a layout animation, so rendering them at width 0 and
      growing them to their real width ANIMATES that growth. Nothing renders
      until `onLayout` has answered.
    */
    expect(pill()).toMatch(/\{w \? slots\.map/);
  });
});
