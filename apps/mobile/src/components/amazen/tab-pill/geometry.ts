import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The tab pill's geometry: every width and height it is laid out with, and
 * the bottom padding a scrolling tab screen reserves for it. Plain numbers and
 * arithmetic — `tab-safe.spec.ts` and `footer-glyphs.spec.ts` read them.
 */

/*
  ⚠️ THE CAPSULE IS THE FIXED ONE, AND THE MARKS SHARE THE REST.

  This is the inverse of the obvious arrangement and it took a round of device
  screenshots to see why. Fixing the MARKS and letting the capsule grow into
  the remainder also holds geometry still — there are always four marks and one
  capsule — but it makes the capsule 158pt on a 390pt phone, which is nearly
  twice the reference's 90pt and reads as a slab with a small word adrift in it.

  Fixed capsule, marks on `flex: 1`:

    390pt phone   inner 350   capsule 108   each mark 58.5   ← the reference's 59
    360pt phone   inner 320   capsule 108   each mark 51
    430pt phone   inner 390   capsule 108   each mark 68

  The capsule is identical on every tab and every phone; the marks split what
  is left, and there are always exactly four of them. Nothing resizes when the
  selection moves.

  ⚠️ 108 AND NOT THE REFERENCE'S 90, by 18pt. 90 leaves 43pt of label, which
  fits "Home" (the word the reference happens to show) and truncates German
  "Aufträge" at 57pt. 108 leaves 61pt and every label in all five languages
  fits. A capsule measured off the shortest word in the shortest language is
  how the other four end up clipped.
*/
export const CAPSULE_W = 108;
export const GAP = 2;
/** A mark never goes below this, however narrow the phone. */
export const MIN_MARK_W = 40;
/** The row's own left padding — the capsule's origin. */
export const PAD = 6;

/**
 * How far the scrim reaches ABOVE the pill.
 *
 * The bar floats over the content now, so something has to take the content
 * from legible to gone before it reaches the pill. 56pt is about two list
 * rows: enough that a line of text is already faint by the time the pill
 * covers it, short enough that it does not eat the screen.
 */
export const SCRIM_RISE = 56;

/*
  THE BAR'S OWN GEOMETRY, AND THE ONLY PLACE IT IS WRITTEN DOWN.

  ⚠️ THE BAR IS NOT A FIXED HEIGHT. It sits on the safe-area inset, and that
  inset is different on every device the app runs on:

      Android, gesture navigation   24pt
      Android, three buttons        48pt
      iPhone with a home indicator  34pt
      iPhone without one             0pt  (floored to 12)

  A screen reserving a CONSTANT is therefore right on exactly one of them. The
  constant was 110: on three-button Android the bar is 132pt and 22pt of the
  last row was behind it, and on every notched iPhone it was 8pt short. Both
  are invisible in a simulator set to the one device the number was measured
  on, which is how it survived.
*/
export const BAR_PAD_TOP = 6;
export const BAR_ROW = 62;
/** How far the pill floats above the inset. */
export const BAR_LIFT = 16;
/** An iPhone SE has no inset at all; the bar still may not touch the edge. */
export const BAR_INSET_FLOOR = 12;
/** A row must STOP clear of the bar, not end exactly against it. */
export const BAR_CLEARANCE = 8;

/** What the bar occupies, bottom-up, for a given safe-area inset. */
export function tabSafeFor(bottomInset: number) {
  return (
    BAR_PAD_TOP + BAR_ROW + BAR_LIFT + Math.max(bottomInset, BAR_INSET_FLOOR) + BAR_CLEARANCE
  );
}

/**
 * Bottom padding for a scrolling tab screen.
 *
 * ⚠️ EVERY SCROLLING TAB SCREEN MUST USE THIS. The bar is absolutely
 * positioned, so React Navigation measures it as zero and leaves the scene the
 * whole window. A screen that forgets hides its last row behind the pill with
 * nothing on screen to explain it. `tab-safe.spec.ts` fails if one does.
 */
export function useTabSafe() {
  return tabSafeFor(useSafeAreaInsets().bottom);
}

/**
 * Every slot's width, in points, from the pill's own measured width.
 *
 * ⚠️ MEASURED AND DIVIDED, NOT FLEXED — and that is a correction, not a
 * preference. `flex: 1` on the marks looked right and shipped wrong: two of
 * the five slots are wrapped in a `TourTarget` (a plain `View`, so a COLUMN),
 * and a `flex: 1` child of a column flexes its HEIGHT — its width falls back
 * to content. The wrapped and unwrapped slots then resolved differently, the
 * row came out wider than the pill, and **More was pushed off the right edge
 * entirely**.
 *
 * A number each slot is simply told cannot do that. It also means the two
 * tour-wrapped tabs and the three plain ones are laid out by the same
 * arithmetic, which is the actual invariant — not "they both say flex".
 */
export function slotWidths(pillInnerWidth: number): { capsule: number; mark: number } {
  const usable = Math.max(0, pillInnerWidth - 4 * GAP);
  const capsule = Math.min(CAPSULE_W, Math.max(0, usable - 4 * MIN_MARK_W));
  const mark = Math.max(MIN_MARK_W, (usable - capsule) / 4);
  return { capsule, mark };
}
