/**
 * "Measure until it stops moving" — the rule BOTH tour engines follow.
 *
 * The engines used to measure ONCE after a guessed delay and then poll every
 * 350ms to correct whatever they got. That is why a misplaced spotlight was
 * intermittent rather than always wrong: the measurement raced an animation it
 * knew nothing about. On the phone the race is a tab switch, a sheet, a list
 * finishing its first layout or an image arriving; on the web it is
 * `scroll-behavior: smooth`. Either way the member watched the highlight jump
 * into place from somewhere else, and could read — or tap — while it was wrong.
 *
 * The replacement needs no tuned constant: read the target repeatedly at a
 * short interval and only believe a position once TWO CONSECUTIVE READS AGREE.
 * A scroll, a sheet opening, a late image and a slow fetch all move the rect
 * between two reads, so all four are handled by the same rule. A target that
 * never holds still (a spinner, a live clock) is capped so the tour falls back
 * to its last reading instead of looping forever.
 *
 * This file is pure geometry: no react-native, no React — which is also what
 * makes it testable in this app's runner. `apps/web-app/src/components/tour/
 * measure.ts` is the same algorithm with the same names; they cannot be
 * literally shared (a DOMRect and a `measureInWindow` callback have nothing in
 * common) but they must stay readable as one idea. Change one, change both.
 *
 * The scroll helpers at the bottom exist only here: on the web the browser owns
 * `scrollIntoView`, while a React Native list has to be told an offset.
 */
import type { TargetRect } from './types';

/** A measured rectangle in window coordinates — the registry's `TargetRect`. */
export type Box = TargetRect;

/** The visible area a box is judged against (the screen, on a phone). */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * How far two readings may differ and still count as "the same position".
 * Sub-pixel: a device pixel ratio of 2.75 lands layout on fractions, which
 * jitters the last decimal without anything actually moving. A larger value
 * would call the tail of a scroll animation "settled" while it is still gliding.
 */
export const STABLE_EPSILON_PX = 0.5;

/**
 * How often to re-read. ~4 frames: long enough that an animation has visibly
 * moved between two reads (so it cannot fake agreement), short enough that a
 * target already sitting still is confirmed in ~130ms — far faster than the
 * 480ms and 80ms guesses this replaces.
 */
export const MEASURE_INTERVAL_MS = 64;

/**
 * Cap on reads before we stop waiting for stillness (~2.5s). A never-settling
 * target (a spinner inside the highlighted card, a running shift timer) must
 * not hold the tour forever; we fall back to its latest reading, which is the
 * best answer available, rather than polling for the rest of the tour.
 */
export const MAX_SETTLE_TICKS = 40;

/** Do two readings describe the same rectangle? (null never agrees.) */
export function boxesAgree(a: Box | null, b: Box | null, epsilon = STABLE_EPSILON_PX): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
}

/**
 * Is this rectangle worth DRAWING a spotlight on?
 *
 * Two failures it prevents, both of which the overlay used to render happily
 * because it drew whatever it was handed:
 *  - zero size: the View exists but has not been laid out (or is collapsed) —
 *    a ring around a 0×0 point.
 *  - entirely outside the screen: a target below the fold. The engine never
 *    scrolled, so the dimming rectangles and the ring were computed from a `y`
 *    past the bottom of the screen — the four dim panes cover everything and
 *    the tooltip describes an element nobody can see.
 * Partially visible is fine and deliberate: an element straddling an edge is
 * still the thing the text is about.
 */
export function isDrawableBox(box: Box | null, viewport: Viewport): boolean {
  if (!box) return false;
  if (box.width <= 0 || box.height <= 0) return false;
  if (box.x + box.width <= 0 || box.y + box.height <= 0) return false;
  if (box.x >= viewport.width || box.y >= viewport.height) return false;
  return true;
}

/** What the loop remembers between reads. */
export interface SettleState {
  /** The previous DRAWABLE reading, or null if the last read was unusable. */
  readonly last: Box | null;
  /** Reads taken so far, against MAX_SETTLE_TICKS. */
  readonly ticks: number;
}

export type SettleStatus =
  /** Keep reading: nothing usable yet, or the target is still moving. */
  | 'measuring'
  /** Two consecutive reads agreed — this position is real. */
  | 'settled'
  /** Out of patience. `box` holds the best reading, or null if there never was one. */
  | 'exhausted';

export interface SettleResult {
  state: SettleState;
  status: SettleStatus;
  /** The box to draw. Non-null only for 'settled', or 'exhausted' with a usable reading. */
  box: Box | null;
}

export function beginSettle(): SettleState {
  return { last: null, ticks: 0 };
}

/**
 * Fold one reading into the loop. Pure — which is the point: the rule is the
 * same on both surfaces and is testable without a device or a browser.
 */
export function settleTick(
  state: SettleState,
  measured: Box | null,
  viewport: Viewport,
  maxTicks = MAX_SETTLE_TICKS,
): SettleResult {
  const ticks = state.ticks + 1;
  const outOfPatience = ticks >= maxTicks;

  if (!isDrawableBox(measured, viewport)) {
    // Unusable reading. Forget `last` as well: a settle must always rest on two
    // consecutive DRAWABLE reads, or a pre-scroll reading could pair up with a
    // post-scroll one and be mistaken for stillness.
    return { state: { last: null, ticks }, status: outOfPatience ? 'exhausted' : 'measuring', box: null };
  }

  if (boxesAgree(state.last, measured)) {
    return { state: { last: measured, ticks }, status: 'settled', box: measured };
  }

  return {
    state: { last: measured, ticks },
    status: outOfPatience ? 'exhausted' : 'measuring',
    // Out of patience but the target IS on screen: draw where it is now. Better
    // than skipping a step whose element the member can plainly see.
    box: outOfPatience ? measured : null,
  };
}

// ── Bringing a target into view (native only) ───────────────────────────────

/**
 * How much clear screen a target needs above and below before we leave the list
 * where it is. Generous, because the tooltip card (~176pt) has to fit on one
 * side of it: a target technically visible 30pt from the bottom edge leaves the
 * card nowhere to go, and the overlay flips it over the target itself.
 */
export const IN_VIEW_MARGIN_PX = 96;

/** Is the target far enough inside the screen to spotlight without scrolling? */
export function isComfortablyInView(box: Box, viewport: Viewport, margin = IN_VIEW_MARGIN_PX): boolean {
  // A target taller than the usable screen can never satisfy the margin on both
  // sides; asking it to would scroll on every step forever. Its top edge being
  // on screen is the best that can be done.
  const usable = viewport.height - margin * 2;
  if (box.height >= usable) return box.y >= 0 && box.y < viewport.height - margin;
  return box.y >= margin && box.y + box.height <= viewport.height - margin;
}

/**
 * The content offset that centres the target on screen.
 *
 * A list can only be told an ABSOLUTE offset, while `measureInWindow` answers
 * in screen coordinates — so the caller supplies where the list is scrolled to
 * now, and the delta between "where the target is" and "where we want it"
 * converts one into the other. Clamped at 0 (never scroll above the top); the
 * bottom needs no clamp because a list refuses to overscroll past its content
 * and the stability loop re-measures wherever it actually lands.
 */
export function offsetToCentre(box: Box, viewport: Viewport, currentOffset: number): number {
  const desiredY = Math.max(IN_VIEW_MARGIN_PX, (viewport.height - box.height) / 2);
  return Math.max(0, currentOffset + (box.y - desiredY));
}
