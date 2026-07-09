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
 */

const CONSENT_KEY = '@hbcfield/bg-location-consent';

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
export async function hasBackgroundLocationConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === 'granted';
  } catch {
    return false;
  }
}

/** Reset the stored decision (e.g. on account switch) so it is asked again. */
export async function clearBackgroundLocationConsent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
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
    if (!showUI) return false; // fail closed — never request bg permission silently
    return new Promise<boolean>((resolve) => {
      waiters.push(resolve);
      if (waiters.length === 1) showUI?.(true); // show once for concurrent callers
    });
  })();
}

/** Called by the modal when the user decides. Persists an accept and resolves all waiters. */
export async function resolveBackgroundLocationConsent(granted: boolean): Promise<void> {
  if (granted) {
    try {
      await AsyncStorage.setItem(CONSENT_KEY, 'granted');
    } catch {
      /* ignore */
    }
  }
  showUI?.(false);
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve(granted));
}
