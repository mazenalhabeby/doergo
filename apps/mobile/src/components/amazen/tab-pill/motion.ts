import { Easing, ReduceMotion } from 'react-native-reanimated';

/**
 * How the bar moves.
 *
 * ⚠️ ONE MOVEMENT, NOT FIVE. The capsule slides; everything else crossfades
 * under it. A bar where the tint slides AND the icons hop AND the labels
 * bounce is four things competing for the same 180ms, and the eye reads none
 * of them — it just reads "busy".
 *
 * `enter` (180ms) rather than `state` (120ms): 120 is right for a colour or an
 * opacity, and far too quick for a ~250pt slide, which at that speed reads as
 * a jump rather than a movement. The easing is the system's one curve.
 *
 * ⚠️ `ReduceMotion.System` on every animation. Somebody who has asked their
 * phone to stop moving things has asked this too, and Reanimated will collapse
 * these to an instant change on its own — but only if it is told.
 */
/**
 * ⚠️ A SPRING, THE SAME ONE FOR EVERY MOVING PART, AND IT NEVER OVERSHOOTS.
 *
 * `withTiming` was right for a fade and wrong for this: the capsule is an
 * object being pushed across a surface by a thumb, and a curve that starts and
 * stops at fixed times reads as a slide-show rather than a movement, however
 * well chosen the bezier.
 *
 * ⚠️ BUT `dampingRatio: 0.92` WAS A BUG, NOT A FLOURISH. Just under critical
 * is lovely on a thing that moves — and this spring also drives a WIDTH. An
 * overshooting width means the slot you just left shrinks past its mark size
 * and comes back, so its mark rocks left and right after the tint has already
 * gone. On a row of five, that reads as the bar settling down after you, which
 * is exactly the fidget a tab bar must not have.
 *
 * Critically damped, and clamped as well: `dampingRatio: 1` alone still allows
 * a hair of numerical overshoot, and on a layout property a hair is visible.
 *
 * ⚠️ AND IT IS SHARED. The capsule's position and every slot's width are
 * driven by this exact config, which is the only reason they stay aligned
 * frame by frame: two springs with different parameters would drift apart in
 * the middle of the transition and the tint would run ahead of its own slot.
 */
export const SLIDE = {
  duration: 340,
  dampingRatio: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;
export const TINT = {
  duration: 120,
  easing: Easing.bezier(0.2, 0.8, 0.2, 1),
  reduceMotion: ReduceMotion.System,
} as const;

/*
  ⚠️ EVERY ANIMATION GETS ITS OWN COPY OF THE CONFIG. This is not style.

  Reanimated FREEZES an object once it has been shared to the UI thread, and
  `withSpring` / `withTiming` write their running state onto the config they
  are handed — so passing the module-level constant directly crashed the
  screen the second time it animated:

    "You attempted to set the key `current` with the value `undefined` on an
     object that is meant to be immutable and has been frozen."

  A fresh object per call costs nothing and cannot be frozen out from under
  the animation. The constants stay constants; only copies are handed out.
*/
export const slide = () => ({ ...SLIDE });
export const tint = () => ({ ...TINT });
