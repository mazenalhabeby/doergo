/**
 * A gesture worklet must not call an ordinary JS function.
 *
 * ⚠️ THIS IS NOT A LINT PREFERENCE — IT KILLS THE PROCESS.
 *
 *   FATAL EXCEPTION: main
 *   com.facebook.jni.CppException: [Worklets] Tried to synchronously call a
 *   non-worklet function `spring` on the UI thread.
 *
 * Not a red box, not a caught error: the app is gone. And the mistake is easy
 * to make twice, because the OPPOSITE rule holds a few files away — in
 * `tab-pill.tsx` the animations start from a `useEffect` on the JS thread,
 * where a `spring()` factory is exactly right (Reanimated freezes a shared
 * config and then writes the animation's own state onto it).
 *
 * Same-looking code, two threads, two different correct answers. Hence a test.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

/** Files whose animations are driven from inside a gesture. */
const WORKLET_FILES = ['components/amazen/arrangeable.tsx'];

const read = (p: string) =>
  fs
    .readFileSync(path.join(SRC, p), 'utf8')
    // Comments name the forbidden thing constantly — this file included.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('gesture worklets stay on the UI thread', () => {
  it.each(WORKLET_FILES)('%s calls no factory inside an animation', (file) => {
    const src = read(file);
    /*
      `withTiming(x, spring())` and friends. An inline object literal is fine —
      it is created on the UI thread with nothing to capture — and `runOnJS(fn)`
      is fine, because that is the sanctioned way across the boundary.
    */
    const bad = [...src.matchAll(/with(?:Timing|Spring)\([^)]*?,\s*([A-Za-z_$][\w$]*)\s*\(\)/g)];
    expect(bad.map((m) => m[1])).toEqual([]);
  });

  it.each(WORKLET_FILES)('%s reaches the JS thread only through runOnJS', (file) => {
    const src = read(file);
    // Every gesture callback that changes React state has to hop deliberately.
    if (/\.onEnd\(/.test(src)) expect(src).toContain('runOnJS(');
  });
});

/**
 * Drag state is cleared when the new order is DRAWN, not when the finger lifts.
 *
 * ⚠️ THE BUG THIS EXISTS FOR: clearing the shared values inside the drop
 * handler resets them on the UI thread immediately, while React's re-render
 * lands a frame or more later. For those frames the column is still drawn in
 * the OLD order with every offset back at zero — so the two widgets that
 * swapped snap to their old places and then jump again when the new order
 * arrives. "The 2 widgets jump and back again."
 *
 * `useLayoutEffect` runs after the commit and before the frame is painted, so
 * there is no frame in between to see.
 */
import * as fsx from 'fs';
import * as pathx from 'path';

const ARRANGEABLE = pathx.resolve(
  __dirname, '../..', 'components/amazen/arrangeable.tsx',
);

describe('the drop leaves nothing to flicker', () => {
  const src = () =>
    fsx
      .readFileSync(ARRANGEABLE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('clears the drag state in a layout effect, not in the drop handler', () => {
    const s = src();
    expect(s).toMatch(/useLayoutEffect\(/);
    // Keyed on the order and on the row's index — the two things that change
    // when the reorder is committed.
    expect(s).toMatch(/\[order,/);
    expect(s).toMatch(/\[index,/);
  });

  it('commits the reorder and nothing else when the row actually moves', () => {
    /*
      The moved branch must call `onMove` alone. A stray reset beside it is the
      frame of snap-back this whole arrangement exists to remove.
    */
    const s = src();
    const i = s.indexOf('const land =');
    expect(i).toBeGreaterThan(-1);
    const body = s.slice(i, s.indexOf('}, [index, itemKey', i));
    const moved = body.slice(body.lastIndexOf('return;'));
    expect(moved).toContain('onMove(itemKey, to)');
    expect(moved).not.toMatch(/y\.value\s*=/);
    expect(moved).not.toMatch(/dragging\.value\s*=/);
  });

  it('animates the parting but never the un-parting', () => {
    /*
      ⚠️ THE SECOND FLICKER, and it is subtle. A parted row sits at, say, -105.
      When the reorder commits, the LAYOUT already moves it up a slot — it is
      where it belongs. If the offset then SPRINGS from -105 to 0, it animates
      105pt downward from a position that was already correct: it appears to
      jump up and slide back. Two rows doing that at once, in opposite
      directions, is "one up and one down and then set".

      So the idle branch returns a literal 0 and returns EARLY, before any
      `withSpring` can be reached.
    */
    const s = src();
    const i = s.indexOf('if (d === -1)');
    expect(i).toBeGreaterThan(-1);
    const idle = s.slice(i, s.indexOf('return', s.indexOf('return', i) + 1));
    expect(idle).toMatch(/translateY:\s*0\b/);
    expect(idle).not.toContain('withSpring');
  });
});
