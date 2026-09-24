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
 *
 * ⚠️ THE HAND-WRITTEN DRAG LAYER IS GONE — `components/amazen/arrangeable.tsx`
 * was ~400 lines of shared values, measurement tables and spring maths, and
 * every bug it ever had was in the arithmetic rather than in anything visible.
 * `react-native-draggable-flatlist` owns that now. What is left of our own
 * worklet code is the long press that opens edit mode, and this still guards
 * it: the same crash is one careless `.onStart()` away.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');

/** Files whose animations or state changes are driven from inside a gesture. */
const WORKLET_FILES = ['components/home/editable-widget.tsx'];

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
    for (const cb of src.matchAll(/\.on(?:Start|End|Update|Begin)\(\(\) => \{([\s\S]*?)\n\s*\}\)/g)) {
      const body = cb[1];
      if (/set[A-Z]|on[A-Z]/.test(body)) expect(body).toContain('runOnJS(');
    }
  });

  it.each(WORKLET_FILES)('%s marks every gesture callback a worklet', (file) => {
    const src = read(file);
    /*
      ⚠️ AND THE BUILDER CHAIN MUST NOT BE BROKEN ACROSS STATEMENTS. Splitting
      `Gesture.LongPress()` over several assignments stops Reanimated's Babel
      plugin recognising the callbacks, so the whole gesture silently runs on
      the JS thread. The only sign is one warning: "None of the callbacks in
      the gesture are worklets."
    */
    for (const cb of src.matchAll(/\.on(?:Start|End|Update|Begin)\(\(\) => \{([\s\S]*?)\n\s*\}\)/g)) {
      expect(cb[1]).toMatch(/'worklet';/);
    }
  });
});
