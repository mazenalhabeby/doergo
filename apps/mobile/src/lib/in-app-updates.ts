import { Platform } from 'react-native';
import * as InAppUpdates from 'expo-in-app-updates';

/**
 * Play In-App Updates — Android only.
 *
 * Play downloads and installs inside the app, so nobody is sent to a store
 * listing to hunt for a button. The reason it matters here is narrower than
 * convenience: Play only ever offers a version it ACTUALLY HAS. Our own
 * server's idea of "latest" is a number a human typed, and when that number ran
 * ahead of what the stores served, every older build was blocked with nowhere
 * to go. Play cannot make that mistake.
 *
 * iOS has no equivalent API — Apple provides nothing — so every function here
 * is a no-op there and the App Store link remains the only route.
 */
export const IN_APP_UPDATES_SUPPORTED = Platform.OS === 'android';

export interface StoreUpdateState {
  /** Play has a newer build than the one running. */
  available: boolean;
  /** The version Play actually serves — authoritative, unlike a configured one. */
  storeVersion: string | null;
  /** Play permits a background download while the app stays usable. */
  flexibleAllowed: boolean;
  /** Play permits the blocking, Play-driven flow. */
  immediateAllowed: boolean;
}

const NONE: StoreUpdateState = {
  available: false, storeVersion: null, flexibleAllowed: false, immediateAllowed: false,
};

/**
 * Ask Play what it has. Every failure answers "nothing available".
 *
 * A device with no Play Services, an enterprise-managed install, or a network
 * blip must not end up worse off than one that never asked — the caller falls
 * back to the server's own version check, which still works.
 */
export async function checkStore(): Promise<StoreUpdateState> {
  if (!IN_APP_UPDATES_SUPPORTED) return NONE;
  try {
    const r = await InAppUpdates.checkForUpdate();
    return {
      available: !!r?.updateAvailable,
      storeVersion: r?.storeVersion ?? null,
      flexibleAllowed: r?.flexibleAllowed !== false,
      immediateAllowed: r?.immediateAllowed !== false,
    };
  } catch {
    return NONE;
  }
}

/**
 * Start the update Play itself drives.
 *
 * `immediate` blocks the app until it is installed and is for security fixes
 * only; `flexible` downloads in the background and lets the shift carry on,
 * which is what almost every release should use.
 *
 * Returns false when it could not be started, so the caller can fall back to
 * opening the store rather than leaving a button that appears to do nothing.
 */
export async function startStoreUpdate(immediate = false): Promise<boolean> {
  if (!IN_APP_UPDATES_SUPPORTED) return false;
  try {
    return await InAppUpdates.startUpdate(immediate);
  } catch {
    return false;
  }
}

/**
 * Fires when a FLEXIBLE download finishes. The app must then ask Play to
 * install it — a flexible update that is downloaded and never completed is the
 * common way this feature quietly does nothing.
 */
export function onDownloaded(cb: () => void): () => void {
  if (!IN_APP_UPDATES_SUPPORTED) return () => {};
  try {
    return InAppUpdates.addUpdateListener('updateDownloaded', cb);
  } catch {
    return () => {};
  }
}
