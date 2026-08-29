import { Platform } from 'react-native';

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
/*
  The native module is loaded LAZILY, and never at import time.

  `import * as InAppUpdates from 'expo-in-app-updates'` calls
  requireNativeModule('ExpoInAppUpdates') while the module is being evaluated.
  In Expo Go — and in any dev build made before the package was added — that
  native module does not exist, so the import THREW during startup and took the
  whole app down: this file is reached from _layout.tsx, so nothing rendered at
  all. Every function below already guarded on the platform; the import ran
  before any of them could.

  Resolving it on demand means an app without the native module simply behaves
  as though there is no store update available, which is exactly what the
  fallbacks were written for.
*/
type InAppUpdatesModule = {
  checkForUpdate: () => Promise<{
    updateAvailable?: boolean;
    storeVersion?: string;
    flexibleAllowed?: boolean;
    immediateAllowed?: boolean;
  }>;
  startUpdate: (immediate: boolean) => Promise<boolean>;
  addUpdateListener: (event: string, cb: () => void) => () => void;
};

let cached: InAppUpdatesModule | null | undefined;

/** The module, or null when this binary has no such native module. */
function nativeModule(): InAppUpdatesModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-in-app-updates') as InAppUpdatesModule;
  } catch {
    // Expo Go, iOS, or a build predating the package. Not an error — the
    // caller falls back to the server's own version check.
    cached = null;
  }
  return cached;
}

/**
 * Whether Play's in-app update flow can be used at all.
 *
 * Android AND the native module actually present. Checking the platform alone
 * is what made every call site believe it was available in Expo Go.
 */
export const IN_APP_UPDATES_SUPPORTED = Platform.OS === 'android' && nativeModule() !== null;

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
  const mod = nativeModule();
  if (!IN_APP_UPDATES_SUPPORTED || !mod) return NONE;
  try {
    const r = await mod.checkForUpdate();
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
  const mod = nativeModule();
  if (!IN_APP_UPDATES_SUPPORTED || !mod) return false;
  try {
    return await mod.startUpdate(immediate);
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
  const mod = nativeModule();
  if (!IN_APP_UPDATES_SUPPORTED || !mod) return () => {};
  try {
    return mod.addUpdateListener('updateDownloaded', cb);
  } catch {
    return () => {};
  }
}
