/**
 * "Measure until it stops moving" — the rule BOTH tour engines follow.
 *
 * The engines used to measure ONCE after a guessed delay and then poll every
 * 250ms to correct whatever they got. That is why a misplaced spotlight was
 * intermittent rather than always wrong: the measurement raced an animation it
 * knew nothing about. On the web the race is `scroll-behavior: smooth` (the
 * scroll animates for ~300ms while the rect was read ~16ms in, mid-flight); on
 * the phone it is a tab switch, a sheet, an image or a list settling. Either
 * way the member watched the highlight glide in from the wrong place and could
 * read — or click — while it was wrong.
 *
 * The replacement needs no tuned constant: read the target repeatedly at a
 * short interval and only believe a position once TWO CONSECUTIVE READS AGREE.
 * A scroll, a panel opening, a late image and a slow fetch all move the rect
 * between two reads, so all four are handled by the same rule. A target that
 * never holds still (a spinner, a marquee) is capped so the tour falls back to
 * its last reading instead of looping forever.
 *
 * This file is pure geometry: no DOM, no React. `apps/mobile/src/components/
 * tour/measure.ts` is the same algorithm with the same names — they cannot be
 * literally shared (a DOMRect and a `measureInWindow` callback have nothing in
 * common) but they must stay readable as one idea. Change one, change both.
 */

/** A measured rectangle, in viewport (web) / window (native) coordinates. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The visible area a box is judged against. */
export interface Viewport {
  width: number
  height: number
}

/**
 * How far two readings may differ and still count as "the same position".
 * Sub-pixel: fractional layout (zoom, transforms, a 0.5px border) jitters the
 * last decimal without anything actually moving. A larger value would call the
 * tail of a smooth scroll "settled" while it is still gliding.
 */
export const STABLE_EPSILON_PX = 0.5

/**
 * How often to re-read. ~4 frames: long enough that an animation has visibly
 * moved between two reads (so it cannot fake agreement), short enough that a
 * target already sitting still is confirmed in ~130ms — faster than the 820ms
 * and 480ms guesses this replaces.
 */
export const MEASURE_INTERVAL_MS = 64

/**
 * Cap on reads before we stop waiting for stillness (~2.5s). A never-settling
 * target (a spinner inside the highlighted card, a live clock, a marquee) must
 * not hold the tour forever; we fall back to its latest reading, which is the
 * best answer available, rather than polling for the rest of the tour.
 */
export const MAX_SETTLE_TICKS = 40

/** Do two readings describe the same rectangle? (null never agrees.) */
export function boxesAgree(a: Box | null, b: Box | null, epsilon = STABLE_EPSILON_PX): boolean {
  if (!a || !b) return false
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  )
}

/**
 * Is this rectangle worth DRAWING a spotlight on?
 *
 * Two failures it prevents, both of which the overlays used to render happily
 * because they drew whatever they were handed:
 *  - zero size: the element exists but is collapsed / display:none / not laid
 *    out yet — a spotlight on a 0×0 point, which reads as a stray ring.
 *  - entirely outside the viewport: the classic mid-scroll reading. The ring
 *    and the tooltip land off-screen or clipped to an edge, describing an
 *    element the member cannot see.
 * Partially visible is fine and deliberate: an element straddling an edge is
 * still the thing the text is about.
 */
export function isDrawableBox(box: Box | null, viewport: Viewport): boolean {
  if (!box) return false
  if (box.width <= 0 || box.height <= 0) return false
  if (box.x + box.width <= 0 || box.y + box.height <= 0) return false
  if (box.x >= viewport.width || box.y >= viewport.height) return false
  return true
}

/** What the loop remembers between reads. */
export interface SettleState {
  /** The previous DRAWABLE reading, or null if the last read was unusable. */
  readonly last: Box | null
  /** Reads taken so far, against MAX_SETTLE_TICKS. */
  readonly ticks: number
}

export type SettleStatus =
  /** Keep reading: nothing usable yet, or the target is still moving. */
  | "measuring"
  /** Two consecutive reads agreed — this position is real. */
  | "settled"
  /** Out of patience. `box` holds the best reading, or null if there never was one. */
  | "exhausted"

export interface SettleResult {
  state: SettleState
  status: SettleStatus
  /** The box to draw. Non-null only for "settled", or "exhausted" with a usable reading. */
  box: Box | null
}

export function beginSettle(): SettleState {
  return { last: null, ticks: 0 }
}

/**
 * Fold one reading into the loop. Pure — which is the point: the rule is the
 * same on both surfaces and is testable without a browser or a device.
 */
export function settleTick(
  state: SettleState,
  measured: Box | null,
  viewport: Viewport,
  maxTicks = MAX_SETTLE_TICKS,
): SettleResult {
  const ticks = state.ticks + 1
  const outOfPatience = ticks >= maxTicks

  if (!isDrawableBox(measured, viewport)) {
    // Unusable reading. Forget `last` as well: a settle must always rest on two
    // consecutive DRAWABLE reads, or a pre-scroll reading could pair up with a
    // post-scroll one and be mistaken for stillness.
    return { state: { last: null, ticks }, status: outOfPatience ? "exhausted" : "measuring", box: null }
  }

  if (boxesAgree(state.last, measured)) {
    return { state: { last: measured, ticks }, status: "settled", box: measured }
  }

  return {
    state: { last: measured, ticks },
    status: outOfPatience ? "exhausted" : "measuring",
    // Out of patience but the target IS on screen: draw where it is now. Better
    // than skipping a step whose element the member can plainly see.
    box: outOfPatience ? measured : null,
  }
}
