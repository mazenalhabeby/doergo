import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Prominent background-location disclosure gate.
 *
 * Google Play requires a prominent, in-app disclosure that appears BEFORE the OS
 * background-location permission prompt, names the app, states that location is
 * collected in the background (even when the app is closed/not in use), and lets
 * the user accept or decline. This module coordinates that: the background
 * services call `requestBackgroundLocationConsent()` before requesting the OS
 * permission, and a mounted <LocationConsentModal> renders the actual dialog.
 *
 * The decision is persisted so the disclosure is shown once, not on every trip.
 * "Not now" is remembered too, for a day: the shift heartbeat and the geofence
 * ask on every visit to the Time screen, and an unremembered decline put the
 * sheet back in front of the member each time (clock review, found on the
 * simulator). The "Always location" banner stays as the way to change their mind.
 */

const CONSENT_KEY = '@hbcfield/bg-location-consent';
const DECLINED_KEY = '@hbcfield/bg-location-declined-at';
/** How long a "Not now" holds before the disclosure may be shown again. */
export const CONSENT_ASK_AGAIN_MS = 24 * 60 * 60 * 1000;

type ShowFn = (show: boolean) => void;

let showUI: ShowFn | null = null;
let waiters: Array<(granted: boolean) => void> = [];

/** The mounted modal registers its show/hide setter here. Returns an unsubscribe. */
export function registerConsentUI(fn: ShowFn): () => void {
  showUI = fn;
  return () => {
    if (showUI === fn) showUI = null;
  };
}

/** Has the user already accepted the background-location disclosure? */
async function hasBackgroundLocationConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === 'granted';
  } catch {
    return false;
  }
}

/** Did the member say "Not now" within the last day? */
async function declinedRecently(now = Date.now()): Promise<boolean> {
  try {
    const at = Number(await AsyncStorage.getItem(DECLINED_KEY));
    return Number.isFinite(at) && at > 0 && now - at < CONSENT_ASK_AGAIN_MS;
  } catch {
    return false;
  }
}

/**
 * Ensure the user has seen and accepted the background-location disclosure.
 * Resolves true if consent is (already) granted, false if declined or no UI is
 * mounted. Callers MUST NOT request the OS background permission when false.
 */
export function requestBackgroundLocationConsent(): Promise<boolean> {
  return (async () => {
    if (await hasBackgroundLocationConsent()) return true;
    if (await declinedRecently()) return false; // asked today already — the answer was "Not now"
    if (!showUI) return false; // fail closed — never request bg permission silently
    return new Promise<boolean>((resolve) => {
      waiters.push(resolve);
      if (waiters.length === 1) showUI?.(true); // show once for concurrent callers
    });
  })();
}

/** Called by the modal when the user decides. Persists an accept and resolves all waiters. */
export async function resolveBackgroundLocationConsent(granted: boolean): Promise<void> {
  try {
    if (granted) {
      await AsyncStorage.setItem(CONSENT_KEY, 'granted');
      await AsyncStorage.removeItem(DECLINED_KEY);
    } else {
      await AsyncStorage.setItem(DECLINED_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }
  showUI?.(false);
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve(granted));
}
