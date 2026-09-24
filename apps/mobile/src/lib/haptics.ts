/**
 * The three taps the home screen makes while it is being rearranged.
 *
 * `home-screen.md` §3 names them exactly: `impactLight` when the mode opens,
 * `selectionAsync()` each time a card crosses another, `impactMedium` on the
 * drop. They are the whole of the feedback that a 500ms hold DID something —
 * without the first one the member is looking at a screen that has not changed
 * yet and holding on in hope.
 *
 * ⚠️ LOADED LAZILY AND GUARDED, BECAUSE THE NATIVE MODULE MAY NOT BE IN THE
 * BUILD ON THE PHONE. `expo-haptics` is a native module, so a JS-only OTA that
 * adds it reaches a binary that does not have it — and an Expo module that is
 * missing throws at IMPORT, which would take the whole home screen down rather
 * than cost it a vibration. A top-level `import * as Haptics` is therefore not
 * safe here; this file is.
 *
 * ⚠️ EVERY CALL IS FIRE-AND-FORGET. Nothing on screen may wait on a motor.
 */

type HapticsModule = {
  impactAsync: (style: unknown) => Promise<void>;
  selectionAsync: () => Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown; Heavy: unknown };
};

/** `undefined` = not tried yet, `null` = tried and not there. */
let mod: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** The mode opened, or a card landed. */
export function impact(strength: 'light' | 'medium'): void {
  const h = load();
  if (!h) return;
  const style = strength === 'light' ? h.ImpactFeedbackStyle.Light : h.ImpactFeedbackStyle.Medium;
  void h.impactAsync(style).catch(() => {});
}

/** One card crossed another and the order changed under the finger. */
export function selection(): void {
  const h = load();
  if (!h) return;
  void h.selectionAsync().catch(() => {});
}
