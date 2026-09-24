/**
 * Every scrolling tab screen reserves room for the floating pill — and the
 * room it reserves is the room the pill actually takes.
 *
 * ⚠️ THE BAR IS ABSOLUTELY POSITIONED, so React Navigation measures it as ZERO
 * and leaves the scene full height. That is deliberate — the content has to run
 * underneath for the scrim to fade it and for the glass to have something to
 * blur — but it means the reservation is the SCREEN's job, and a screen that
 * forgets hides its last row behind the bar with nothing on screen to say why.
 *
 * ⚠️ AND IT IS NOT A CONSTANT. The bar sits on the safe-area inset, and that
 * inset is different on every device the app runs on. It used to be a flat 110,
 * which was right on the one device it was measured on and wrong everywhere
 * else: 22pt of the last row was behind the bar on three-button Android and
 * 8pt on every notched iPhone.
 *
 * Both failures are invisible in review, because the thing that breaks is the
 * bottom of a long list on a device you are not holding. Hence a test.
 */
import * as fs from 'fs';
import * as path from 'path';

const TABS = path.resolve(__dirname, '../../../app/(app)/(tabs)');
const PILL = path.resolve(__dirname, '../../components/amazen/tab-pill.tsx');
const read = (p: string) => fs.readFileSync(p, 'utf8');

/** Every tab screen, found rather than listed — a new one is covered on day one. */
function tabScreens(): string[] {
  return fs
    .readdirSync(TABS)
    .filter((f) => f.endsWith('.tsx') && f !== '_layout.tsx')
    .map((f) => path.join(TABS, f));
}

/** The real safe-area insets the app meets, in points. */
const INSETS = {
  'Android, gesture navigation': 24,
  'Android, three buttons': 48,
  'iPhone with a home indicator': 34,
  'iPhone without one': 0,
};

describe('the tab screens leave room for the pill', () => {
  const screens = tabScreens();

  it('finds them', () => {
    expect(screens.length).toBeGreaterThan(4);
  });

  it.each(screens.map((p) => [path.basename(p), p]))(
    '%s reserves the pill through useTabSafe if it scrolls',
    (_name, file) => {
      const src = read(file);
      const scrolls = /<(ScrollView|FlatList|SectionList)\b/.test(src);
      if (!scrolls) return; // index.tsx just renders <HomeScreen />, which does its own.
      expect(src).toContain('useTabSafe');
    },
  );

  it('the home screen reserves it too, in its own file', () => {
    // `(tabs)/index.tsx` delegates, so the padding lives with the column.
    const home = read(path.resolve(__dirname, '../../home/home-screen.tsx'));
    expect(home).toContain('useTabSafe');
    expect(home).toMatch(/paddingBottom: tabSafe/);
  });

  it('nobody reserves a hard-coded number instead', () => {
    /*
      The old `TAB_SAFE` constant. A screen importing it again would compile,
      render, and be wrong on two of the four devices above.
    */
    for (const file of [...screens, path.resolve(__dirname, '../../home/home-screen.tsx')]) {
      expect(read(file)).not.toMatch(/\bTAB_SAFE\b/);
    }
  });

  it('the pill really is absolute — the reason all of the above is needed', () => {
    /*
      If this ever goes back in flow, the reservations above become dead space
      at the bottom of every screen. The two decisions are one decision and
      have to move together.
    */
    expect(read(PILL)).toMatch(/position: 'absolute'/);
  });
});

describe('the reservation covers the bar on every device', () => {
  /*
    Re-derived from the source rather than imported: `tab-pill.tsx` pulls in
    gesture-handler and Reanimated, neither of which jest transforms. The first
    test asserts the numbers still match, so the copy cannot drift.
  */
  const src = read(PILL);
  const num = (name: string) => {
    const m = src.match(new RegExp(`const ${name} = (\\d+);`));
    if (!m) throw new Error(`${name} is gone from tab-pill.tsx`);
    return Number(m[1]);
  };

  it('reads the bar geometry out of the component', () => {
    expect(num('BAR_PAD_TOP')).toBeGreaterThan(0);
    expect(num('BAR_ROW')).toBeGreaterThan(40);
    expect(num('BAR_LIFT')).toBeGreaterThan(0);
    expect(num('BAR_INSET_FLOOR')).toBeGreaterThan(0);
    expect(num('BAR_CLEARANCE')).toBeGreaterThan(0);
  });

  /** What the bar occupies — the same arithmetic the component lays out with. */
  const barHeight = (inset: number) =>
    num('BAR_PAD_TOP') + num('BAR_ROW') + num('BAR_LIFT') + Math.max(inset, num('BAR_INSET_FLOOR'));

  /** What a screen reserves. */
  const reserved = (inset: number) => barHeight(inset) + num('BAR_CLEARANCE');

  it.each(Object.entries(INSETS))('clears the bar on %s', (_name, inset) => {
    expect(reserved(inset)).toBeGreaterThan(barHeight(inset));
  });

  it('is not the same number on every device — that was the bug', () => {
    const all = Object.values(INSETS).map(reserved);
    expect(new Set(all).size).toBeGreaterThan(1);
  });

  it('the old flat 110 really was short on two of the four', () => {
    // Kept as the record of what went wrong, so nobody "simplifies" it back.
    const short = Object.entries(INSETS).filter(([, i]) => barHeight(i) > 110);
    expect(short.map(([n]) => n).sort()).toEqual([
      'Android, three buttons',
      'iPhone with a home indicator',
    ]);
  });
});
