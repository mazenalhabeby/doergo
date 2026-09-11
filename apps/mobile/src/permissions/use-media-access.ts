import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

/**
 * Whether this screen may use the camera or the photo library — asked
 * continuously, not once.
 *
 * ⚠️ EVERY `use*Permissions()` HOOK IN EXPO READS ONCE, ON MOUNT, AND NEVER
 * AGAIN. That is the whole reason this file exists, and it is wrong in both
 * directions:
 *
 *   · Grant it in Settings and come back — the screen still believes it is
 *     denied, so the button appears to do nothing until you change screens.
 *   · REVOKE it in Settings and come back — the screen still believes
 *     `granted: true`, renders a viewfinder, and asks the OS for frames it will
 *     not give. The app's idea of its own permissions outlives the permission.
 *
 * So the status is re-read with the tuple's THIRD element, which fetches
 * without prompting — on screen focus AND on the app returning to the
 * foreground.
 *
 * ⚠️ Both, because they are different events. This comment used to claim
 * "returning from Settings is a focus event". It is not: the screen never
 * blurred, so the navigator never re-focuses it. Opening Settings is the ONE
 * action a blocked screen offers, so with only the focus half somebody changes
 * the permission, comes back, and is shown the same "Open settings" button —
 * which was reported from a real phone.
 *
 * ⚠️ AND `null` IS NOT "DENIED". Until the first read lands, nothing is known.
 * Code that reads it as denied flashes "blocked" at somebody who has granted
 * it; code that reads it as askable offers a button that silently does nothing
 * once the system has stopped prompting. `resolved` gives the third state a
 * name so neither mistake is expressible.
 */

/** The shape every expo permission hook returns. */
type PermissionTuple<P extends { granted: boolean; canAskAgain: boolean }> = [
  P | null,
  () => Promise<P>,
  () => Promise<P>,
];

export interface MediaAccess {
  /** null until the first check lands. Not a denial. */
  resolved: boolean;
  granted: boolean;
  /** Known refused AND the system will not ask again — only Settings helps. */
  blocked: boolean;
  /** Known refused, but asking is still worth a tap. */
  canAsk: boolean;
  /** A request is in flight. */
  asking: boolean;
  ask: () => Promise<boolean>;
  refresh: () => Promise<unknown>;
}

/**
 * The one implementation. Everything below is a binding.
 *
 * Kept generic over the tuple rather than over the module, so a new permission
 * (microphone, contacts) is one more binding and no new logic — and so the
 * rules above cannot be re-derived slightly differently for the next one.
 */
function useAccess<P extends { granted: boolean; canAskAgain: boolean }>(
  tuple: PermissionTuple<P>,
): MediaAccess {
  const [permission, request, get] = tuple;
  const [asking, setAsking] = useState(false);

  /*
    Two different "came back", and only one of them is a navigation event.

    ⚠️ `useFocusEffect` fires when this screen is focused WITHIN the navigator —
    going back and opening it again. It does NOT fire when the person leaves the
    app entirely and returns, because the screen never blurred: as far as the
    navigator is concerned it was focused the whole time.

    Which is exactly the case that matters here. The only button on a blocked
    screen is "Open settings", and that sends somebody OUT of the app to the
    one place the answer can change. Without the AppState half they come back,
    the screen still says blocked, and the button offers to open Settings again
    — the loop this hook exists to prevent.
  */
  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void get();
      return () => { focused.current = false; };
    }, [get]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // Only the screen somebody is actually looking at. `get()` prompts
      // nobody, but re-reading it for every mounted scanner on every
      // foreground is work with no reader.
      if (state === 'active' && focused.current) void get();
    });
    return () => sub.remove();
  }, [get]);

  /**
   * Ask, and return the ANSWER.
   *
   * Throwing the result away is how a refusal becomes a button that does
   * nothing: once the system has stopped prompting, `request()` resolves
   * immediately — denied, no dialog — and a caller that ignores it has nothing
   * to say.
   */
  const ask = useCallback(async () => {
    setAsking(true);
    try {
      const next = await request();
      return next.granted;
    } catch {
      return false;
    } finally {
      setAsking(false);
    }
  }, [request]);

  return {
    resolved: permission !== null,
    granted: permission?.granted === true,
    blocked: permission !== null && !permission.granted && permission.canAskAgain === false,
    canAsk: permission !== null && !permission.granted && permission.canAskAgain !== false,
    asking,
    ask,
    refresh: get,
  };
}

/** The in-app viewfinder (`expo-camera`). */
export function useCameraAccess(): MediaAccess {
  return useAccess(useCameraPermissions());
}

/** Handing off to the system camera app (`expo-image-picker`). */
export function usePickerCameraAccess(): MediaAccess {
  return useAccess(ImagePicker.useCameraPermissions());
}

/**
 * The photo library.
 *
 * ⚠️ iOS has a THIRD answer here — "limited", where the person chose specific
 * photos. `granted` is true for it and the picker works, which is the correct
 * outcome: the app sees what they picked and nothing else. It must not be
 * treated as a denial and nagged about.
 */
export function usePickerLibraryAccess(): MediaAccess {
  return useAccess(ImagePicker.useMediaLibraryPermissions());
}

// ─────────────────────────────────────────────────────────────────────────────
// The imperative half
// ─────────────────────────────────────────────────────────────────────────────

export type AccessOutcome = 'granted' | 'denied' | 'blocked';

/**
 * For flows triggered by a tap rather than rendered — the image picker.
 *
 * A hook cannot answer "may I, right now?" inside an event handler, and the
 * picker sheets that call this are not screens that can render a permission
 * state. So the same three rules are available imperatively, reading the
 * CURRENT status first: asking again when the system has stopped prompting is
 * an invisible no-op, and knowing that is the difference between "let me ask"
 * and "only Settings can help".
 */
export async function ensureAccess(kind: 'camera' | 'library'): Promise<AccessOutcome> {
  const get = kind === 'camera'
    ? ImagePicker.getCameraPermissionsAsync
    : ImagePicker.getMediaLibraryPermissionsAsync;
  const request = kind === 'camera'
    ? ImagePicker.requestCameraPermissionsAsync
    : ImagePicker.requestMediaLibraryPermissionsAsync;

  const current = await get();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';

  const next = await request();
  if (next.granted) return 'granted';
  return next.canAskAgain ? 'denied' : 'blocked';
}
