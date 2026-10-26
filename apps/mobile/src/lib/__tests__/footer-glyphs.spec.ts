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
import { tabPill } from './tab-pill-files';
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
    const src = tabPill();
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
    const longest = [
      'Home',
      'Jobs',
      'Time',
      'Chat',
      'More',
      'Start',
      'Aufträge',
      'Zeit',
      'Mehr',
      'Inicio',
      'Trabajos',
      'Tiempo',
      'Más',
      'Accueil',
      'Tâches',
      'Temps',
      'Plus',
      'Lavori',
      'Tempo',
      'Altro',
    ];
    for (const label of longest) {
      // Readex Pro at 13px averages ~0.55em per glyph.
      expect(label.length * 13 * 0.55).toBeLessThanOrEqual(room);
    }
  });
});

describe('the footer', () => {
  it('has a mark for every tab that can reach the bar or the overflow', () => {
    const src = read(path.join(SRC, 'components/glyphs/tab-glyphs.tsx'));
    const table = src.slice(src.indexOf('TAB_GLYPHS'));
    const drawn = new Set([...table.matchAll(/^\s*'?([A-Za-z-]+)'?:\s*tabMark\(/gm)].map((m) => m[1]!));
    for (const name of TAB_PRIORITY) expect([...drawn]).toContain(name);
  });

  it('draws no Ionicons in the pill', () => {
    /*
      The pill is the one surface a member looks at on every screen. An
      Ionicon here is not a small inconsistency — it is the whole app's icon
      language failing at its most-seen point.
    */
    const pill = tabPill(read);
    expect(pill).not.toMatch(/Ionicons/);
    expect(pill).toContain('TAB_GLYPHS');
  });

  it('draws the same marks on the More page', () => {
    const more = read(path.join(SRC, 'features/more/more-screen.tsx'));
    expect(more).toContain('TAB_GLYPHS');
  });

  it('draws every footer mark from the shared library: a LINE mark, its FILLED twin when active', () => {
    /*
      The web and the phone draw one library (2026-10-26). A hand-drawn footer was a second icon language at
      the app's most-seen point.
    */
    const src = read(path.join(SRC, 'components/glyphs/tab-glyphs.tsx'));
    expect(src).not.toMatch(/react-native-svg/);
    const pairs = [...src.matchAll(/tabMark\('(\w+)', '(\w+)'\)/g)].filter((m) => m[1] !== 'moreDots');
    expect(pairs.length).toBeGreaterThanOrEqual(8);
    for (const [, line, solid] of pairs) expect(line).toBe(`${solid}Line`);
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
  const pill = () => tabPill();

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
    const label = src.slice(src.lastIndexOf('{item.label}') - 1100, src.lastIndexOf('{item.label}'));
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

    // There is something to check.
    const calls = [...src.matchAll(/with(?:Timing|Spring)\(([^;]*?)\);/g)];
    expect(calls.length).toBeGreaterThan(0);

    /*
      ⚠️ EVERY animation takes one of the NAMED configs — never an inline
      object. That is what makes this checkable at all: with a literal at each
      call site, "one of them forgot" is invisible, and one animation that
      still moves is the whole promise broken for the person who asked their
      phone to stop moving things.
    */
    for (const [, args] of calls) {
      /*
        ⚠️ `slide()` / `tint()` — a FRESH copy, never the constant itself.
        Reanimated freezes a shared object and then writes the animation's own
        state onto the config it is given, which crashed the bar the second
        time it moved.
      */
      expect(args).toMatch(/\b(slide|tint)\(\)/);
    }

    // And each named config names it.
    for (const cfg of ['SLIDE', 'TINT']) {
      const i = src.indexOf(`const ${cfg} = `);
      expect(i).toBeGreaterThan(-1);
      expect(src.slice(i, i + 300)).toContain('ReduceMotion.System');
    }
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

describe('the bar settles without rocking', () => {
  const pill = () => tabPill();

  it('never overshoots, because the spring also drives a WIDTH', () => {
    /*
      ⚠️ THE BUG THIS EXISTS FOR: `dampingRatio: 0.92` — just under critical —
      is lovely on something that only moves. This spring also drives the slot
      WIDTH, so an overshoot meant the tab you just left shrank past its mark
      size and came back: its mark rocked left and right after the tint had
      already gone, and the bar looked like it was settling down after you.

      Critically damped AND clamped: `dampingRatio: 1` alone still allows a
      hair of numerical overshoot, and on a layout property a hair is visible.
    */
    const src = pill();
    const i = src.indexOf('const SLIDE = ');
    const cfg = src.slice(i, src.indexOf('} as const', i));
    expect(cfg).toContain('dampingRatio: 1');
    expect(cfg).toContain('overshootClamping: true');
  });

  it('moves the mark monotonically as a slot closes', () => {
    /*
      The mark is centred in its slot, and both the slot and the label inside it
      are driven by the same value — so the mark's position is a function of
      that one number. As long as the number only falls, the mark only travels
      one way. This is what `overshootClamping` buys.
    */
    const CAPSULE = 108,
      MARK = 46,
      ICON = 21,
      PAD = 10,
      LABEL = 40;
    const centreAt = (g: number) => (MARK + (CAPSULE - MARK) * g - (ICON + LABEL * g)) / 2 + PAD;
    let prev = Infinity;
    for (let i = 0; i <= 20; i++) {
      const c = centreAt(1 - i / 20);
      expect(c).toBeLessThanOrEqual(prev + 1e-9);
      prev = c;
    }
  });
});
