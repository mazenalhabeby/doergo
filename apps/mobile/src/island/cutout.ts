import { useEffect, useState } from 'react';
import { Dimensions, NativeModules, Platform, type EmitterSubscription } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Cutout } from './geometry';

/**
 * MEASURE THE PHONE — ⚠️ NEVER ASSUME THE CUTOUT IS CENTRED, NEVER ASSUME ITS
 * SIZE.
 *
 * ⚠️ AND WHERE IT CANNOT BE MEASURED, DO NOT GUESS. An under-display camera
 * (the Z Fold inner screen) reports no cutout at all, and so does an iPhone
 * SE. Both are `none` and get the rectangle. Guessing where an invisible lens
 * might be is how the one law gets broken on the one phone nobody tested.
 */

/**
 * iOS maps exactly, because there are only three answers — §2.
 *
 * The top inset is the measurement Apple actually gives us, and each value
 * belongs to one piece of hardware.
 */
export function cutoutFromInset(top: number, screenW: number): Cutout {
  /* Dynamic Island: a floating pill, and the hardware is already black. */
  if (top >= 54) return { x: (screenW - 126) / 2, y: 11, w: 126, h: 37, kind: 'floating' };
  /* Notch: bolted to the bezel, so it can only be docked under. */
  if (top >= 40) return { x: (screenW - 209) / 2, y: 0, w: 209, h: 30, kind: 'edge' };
  /* SE and older: nothing to wrap. */
  return { x: screenW / 2, y: 0, w: 0, h: 0, kind: 'none' };
}

/**
 * Android hands the rectangles over directly — `WindowInsets.getDisplayCutout()
 * .boundingRects` — but only through native code.
 *
 * ⚠️ THERE IS NO SUCH NATIVE MODULE IN THIS BUILD YET, and inventing a rect
 * from the status-bar height would break the one law on exactly the phones a
 * crew is most likely to be issued. So where the rectangles are unavailable
 * the answer is a CONSERVATIVE one: the whole top band is treated as cutout,
 * which docks the island underneath it and cannot overlap anything.
 *
 * ⚠️ The wrap shape on a punch-hole therefore needs a build with the module.
 * Everything above and below this function is already written for it: hand it
 * a real rect and the ladder produces the wrap without another change.
 */
export function androidCutout(top: number, screenW: number): Cutout {
  const rects = readNativeCutout();
  if (rects && rects.length > 0) {
    const r = rects[0];
    /* ⚠️ `top === 0` means it is attached to the bezel — §2. */
    return { ...r, kind: r.y <= 0 ? 'edge' : 'floating' };
  }
  if (top <= 0) return { x: screenW / 2, y: 0, w: 0, h: 0, kind: 'none' };
  /* The safe answer: dock under the whole band. */
  return { x: 0, y: 0, w: screenW, h: top, kind: 'edge' };
}

interface Rect { x: number; y: number; w: number; h: number }

/**
 * Whatever native module happens to expose the cutout, if one is ever added.
 * ⚠️ Optional on purpose — this file must not stop the app booting on a build
 * that does not have it.
 */
function readNativeCutout(): Rect[] | null {
  try {
    const mod = (NativeModules as Record<string, unknown>).DisplayCutout as
      | { boundingRects?: Rect[] }
      | undefined;
    const rects = mod?.boundingRects;
    return Array.isArray(rects) && rects.length ? rects : null;
  } catch {
    return null;
  }
}

/**
 * ⚠️ CACHED ON MOUNT, RE-READ ONLY ON ROTATION. It cannot change otherwise,
 * and re-measuring on every render is a way to make the island jitter while
 * somebody is reading it.
 */
export function useCutout(insets: EdgeInsets): { hole: Cutout; screenW: number } {
  const [size, setSize] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub: EmitterSubscription | { remove(): void } = Dimensions.addEventListener(
      'change',
      ({ window }) => setSize(window),
    );
    return () => sub.remove();
  }, []);

  const screenW = size.width;
  const hole =
    Platform.OS === 'android' ? androidCutout(insets.top, screenW) : cutoutFromInset(insets.top, screenW);
  return { hole, screenW };
}
