import * as ScreenOrientation from 'expo-screen-orientation';
import { Dimensions } from 'react-native';
import { BREAKPOINTS } from './responsive';

/**
 * Cross-platform orientation policy: tablets rotate freely, phones stay portrait
 * so the phone-first UI is never shown rotated. Device class is derived from the
 * SHORTEST screen side, so it's orientation-independent. Called once at startup.
 * (iPhone is also locked at the OS level via idiom-specific infoPlist keys; this
 * covers Android phones and acts as a JS-level guarantee everywhere.)
 */
export async function applyOrientationPolicy(): Promise<void> {
  const { width, height } = Dimensions.get('screen');
  const isTablet = Math.min(width, height) >= BREAKPOINTS.tablet;
  try {
    if (isTablet) {
      // Tablets rotate freely (portrait + both landscapes). On real iOS builds,
      // upside-down is excluded at the OS level via the ~ipad infoPlist list.
      // (expo-screen-orientation locking is a no-op in Expo Go on the iOS
      // simulator, so the sim may render upside-down there — real builds don't.)
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  } catch {
    // Orientation lock is best-effort; ignore failures (e.g. unsupported device).
  }
}

/**
 * Turn the device sideways for one screen, then give the policy back.
 *
 * A signature is a WIDE, SHORT gesture. In portrait the pad is a tall narrow
 * strip, so a long name runs out of width while most of the height is never
 * touched — and no layout change fixes that, because the empty space is above
 * and below the stroke. Every serious signing product rotates for this.
 *
 * Only the signing pad may call it, and it MUST be paired with
 * releaseLandscape() — the phone UI is portrait-first and everything else in
 * the app would be shown rotated otherwise.
 *
 * Call this BEFORE the pad renders, never while somebody is drawing: rotating
 * remounts the canvas, and a stroke in progress would be lost.
 *
 * Best-effort, like the policy itself. If the lock fails the pad still works —
 * it is merely narrow, which is where this started.
 */
export async function requestLandscape(): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch {
    // Unsupported device, or an OS that declined. Portrait is survivable.
  }
}

/** Hand orientation back to the app-wide policy. Always pair with the above. */
export async function releaseLandscape(): Promise<void> {
  await applyOrientationPolicy();
}
