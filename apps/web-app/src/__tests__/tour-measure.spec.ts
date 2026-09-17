/**
 * The guided tour's "measure until it stops moving" rule.
 *
 * The rule is pure geometry, so the failure that produced it can be replayed
 * exactly: feed the loop the rectangles a target reports DURING a smooth scroll
 * and assert it refuses to believe any of them until the scroll has stopped.
 * The old engine read one rect an animation frame after calling
 * `scrollIntoView` and drew the spotlight there.
 *
 * `apps/mobile/src/components/tour/measure.ts` is the same algorithm; its spec
 * replays the same scenarios against the native reader.
 */
import {
  beginSettle,
  boxesAgree,
  isDrawableBox,
  settleTick,
  MAX_SETTLE_TICKS,
  type Box,
  type Viewport,
} from "@/components/tour/measure"

const VIEWPORT: Viewport = { width: 1280, height: 800 }
const box = (y: number, over: Partial<Box> = {}): Box => ({ x: 100, y, width: 200, height: 40, ...over })

/** Run a sequence of readings through the loop, as the engine's timer would. */
function run(readings: (Box | null)[], viewport = VIEWPORT, maxTicks = MAX_SETTLE_TICKS) {
  let state = beginSettle()
  for (const measured of readings) {
    const result = settleTick(state, measured, viewport, maxTicks)
    state = result.state
    if (result.status !== "measuring") return result
  }
  return { state, status: "measuring" as const, box: null }
}

describe("boxesAgree", () => {
  it("accepts sub-pixel jitter but not a real move", () => {
    expect(boxesAgree(box(100), box(100.3))).toBe(true)
    expect(boxesAgree(box(100), box(104))).toBe(false)
  })

  it("never agrees with a missing reading", () => {
    expect(boxesAgree(null, box(100))).toBe(false)
    expect(boxesAgree(box(100), null)).toBe(false)
    expect(boxesAgree(null, null)).toBe(false)
  })
})

describe("isDrawableBox", () => {
  it("refuses a zero-size element — a ring around a 0x0 point", () => {
    expect(isDrawableBox(box(100, { width: 0 }), VIEWPORT)).toBe(false)
    expect(isDrawableBox(box(100, { height: 0 }), VIEWPORT)).toBe(false)
  })

  it("refuses a rect entirely outside the viewport — the mid-scroll reading", () => {
    expect(isDrawableBox(box(1400), VIEWPORT)).toBe(false) // below the fold
    expect(isDrawableBox(box(-90), VIEWPORT)).toBe(false) // scrolled past above
    expect(isDrawableBox(box(100, { x: -300 }), VIEWPORT)).toBe(false)
    expect(isDrawableBox(box(100, { x: 1400 }), VIEWPORT)).toBe(false)
  })

  it("accepts a rect straddling an edge — still the thing the text is about", () => {
    expect(isDrawableBox(box(-20), VIEWPORT)).toBe(true)
    expect(isDrawableBox(box(780), VIEWPORT)).toBe(true)
  })
})

describe("settleTick", () => {
  it("settles on two consecutive agreeing readings", () => {
    const result = run([box(300), box(300)])
    expect(result.status).toBe("settled")
    expect(result.box).toEqual(box(300))
  })

  it("does not settle mid-scroll — the bug this exists for", () => {
    // What a smooth `scrollIntoView` reports frame by frame, then holds still.
    const duringScroll = [box(1500), box(1180), box(900), box(700), box(520), box(420), box(380)]
    const result = run([...duringScroll, box(380)])
    expect(result.status).toBe("settled")
    expect(result.box).toEqual(box(380)) // where it STOPPED, not where it passed through
  })

  it("never pairs a pre-scroll reading with a post-scroll one", () => {
    // The target starts below the fold (unusable), the page scrolls, and it
    // arrives at a different place. Forgetting `last` on an unusable reading is
    // what stops those two from being mistaken for stillness.
    const result = run([box(1500), box(1500), box(400)])
    expect(result.status).toBe("measuring")
    expect(result.box).toBeNull()
  })

  it("gives up on a target that never holds still, with its latest position", () => {
    const wobbling = Array.from({ length: MAX_SETTLE_TICKS }, (_, i) => box(300 + i * 4))
    const result = run(wobbling)
    expect(result.status).toBe("exhausted")
    expect(result.box).toEqual(box(300 + (MAX_SETTLE_TICKS - 1) * 4))
  })

  it("gives up with NOTHING when the target was never drawable", () => {
    // The caller reads this as "skip the step": a spotlight on empty screen is
    // worse than a step the member never sees.
    const result = run(Array.from({ length: MAX_SETTLE_TICKS }, () => box(100, { width: 0 })))
    expect(result.status).toBe("exhausted")
    expect(result.box).toBeNull()
  })

  it("waits out a late render rather than skipping it", () => {
    const result = run([null, null, null, box(250), box(250)])
    expect(result.status).toBe("settled")
    expect(result.box).toEqual(box(250))
  })
})
