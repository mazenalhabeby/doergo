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

/*
  There was a requestLandscape()/releaseLandscape() pair here.

  They locked the device sideways for the signing pad and handed orientation
  back on close. It worked, and it was the wrong shape: locking the DEVICE
  turned the whole app, and it did not reliably come back. The pad rotates its
  own view inside a portrait window now, which asks nothing of the OS and
  behaves the same on both platforms — so there is nothing left for them to do.
*/
