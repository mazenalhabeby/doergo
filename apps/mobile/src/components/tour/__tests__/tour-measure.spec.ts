/**
 * The guided tour's "measure until it stops moving" rule, plus the two scroll
 * helpers that exist only on native (a browser owns `scrollIntoView`; a React
 * Native list has to be told an absolute offset).
 *
 * Both failures the engine used to have are replayed here as data:
 *  - a target below the fold, which the engine never scrolled to and then drew
 *    a spotlight on anyway, off the bottom of the screen;
 *  - a single measurement taken while a tab / sheet / list was still animating.
 *
 * `apps/web-app/src/components/tour/measure.ts` is the same algorithm and its
 * spec replays the same scenarios against the DOM reader.
 */
import {
  beginSettle,
  boxesAgree,
  isComfortablyInView,
  isDrawableBox,
  offsetToCentre,
  settleTick,
  IN_VIEW_MARGIN_PX,
  MAX_SETTLE_TICKS,
  type Box,
  type Viewport,
} from '../measure';

/** A phone, roughly. */
const SCREEN: Viewport = { width: 390, height: 844 };
const box = (y: number, over: Partial<Box> = {}): Box => ({ x: 16, y, width: 358, height: 90, ...over });

/** Run a sequence of readings through the loop, as the engine's timer would. */
function run(readings: (Box | null)[], viewport = SCREEN, maxTicks = MAX_SETTLE_TICKS) {
  let state = beginSettle();
  for (const measured of readings) {
    const result = settleTick(state, measured, viewport, maxTicks);
    state = result.state;
    if (result.status !== 'measuring') return result;
  }
  return { state, status: 'measuring' as const, box: null };
}

describe('boxesAgree', () => {
  it('accepts sub-pixel jitter but not a real move', () => {
    expect(boxesAgree(box(200), box(200.4))).toBe(true);
    expect(boxesAgree(box(200), box(206))).toBe(false);
  });

  it('never agrees with a missing reading', () => {
    expect(boxesAgree(null, box(200))).toBe(false);
    expect(boxesAgree(box(200), null)).toBe(false);
  });
});

describe('isDrawableBox', () => {
  it('refuses a View that has not been laid out', () => {
    expect(isDrawableBox(box(200, { width: 0, height: 0 }), SCREEN)).toBe(false);
  });

  it('refuses a target below the fold — the native bug, not an exotic case', () => {
    expect(isDrawableBox(box(1200), SCREEN)).toBe(false);
    expect(isDrawableBox(box(-200), SCREEN)).toBe(false);
  });

  it('accepts a target straddling an edge', () => {
    expect(isDrawableBox(box(800), SCREEN)).toBe(true);
  });
});

describe('settleTick', () => {
  it('settles on two consecutive agreeing readings', () => {
    const result = run([box(300), box(300)]);
    expect(result.status).toBe('settled');
    expect(result.box).toEqual(box(300));
  });

  it('does not settle while the list is still scrolling', () => {
    const duringScroll = [box(1200), box(980), box(760), box(560), box(430), box(377)];
    const result = run([...duringScroll, box(377)]);
    expect(result.status).toBe('settled');
    expect(result.box).toEqual(box(377)); // where it STOPPED
  });

  it('never pairs a pre-scroll reading with a post-scroll one', () => {
    const result = run([box(1200), box(1200), box(377)]);
    expect(result.status).toBe('measuring');
    expect(result.box).toBeNull();
  });

  it('gives up on a target that never holds still, with its latest position', () => {
    const wobbling = Array.from({ length: MAX_SETTLE_TICKS }, (_, i) => box(300 + i * 3));
    const result = run(wobbling);
    expect(result.status).toBe('exhausted');
    expect(result.box).toEqual(box(300 + (MAX_SETTLE_TICKS - 1) * 3));
  });

  it('gives up with NOTHING when the target stayed off-screen', () => {
    // No scrollable registered and the target is below the fold: the caller
    // reads this as "skip the step", because a spotlight drawn on empty screen
    // is worse than a step the member never sees.
    const result = run(Array.from({ length: MAX_SETTLE_TICKS }, () => box(1200)));
    expect(result.status).toBe('exhausted');
    expect(result.box).toBeNull();
  });

  it('waits out a target that registers late', () => {
    const result = run([null, null, box(250), box(250)]);
    expect(result.status).toBe('settled');
  });
});

describe('isComfortablyInView', () => {
  it('leaves a target alone when the tooltip has room beside it', () => {
    expect(isComfortablyInView(box(400), SCREEN)).toBe(true);
  });

  it('scrolls for a target below the fold, and for one squeezed against an edge', () => {
    expect(isComfortablyInView(box(1200), SCREEN)).toBe(false);
    expect(isComfortablyInView(box(800), SCREEN)).toBe(false); // visible, but no room for the card
    expect(isComfortablyInView(box(20), SCREEN)).toBe(false);
  });

  it('asks only that a taller-than-screen target starts on screen', () => {
    // Otherwise the margin can never be satisfied on both sides and the engine
    // would scroll on every single step, forever.
    const tall = box(60, { height: 900 });
    expect(isComfortablyInView(tall, SCREEN)).toBe(true);
    expect(isComfortablyInView(box(1000, { height: 900 }), SCREEN)).toBe(false);
  });
});

describe('offsetToCentre', () => {
  it('turns a screen position into a list offset, using where the list is now', () => {
    // Target 1200pt down the screen while the list sits at offset 0: centring a
    // 90pt-tall box on an 844pt screen puts its top at 377.
    expect(offsetToCentre(box(1200), SCREEN, 0)).toBeCloseTo(1200 - 377);
    // The same target seen from a list already scrolled 500 needs 500 more.
    expect(offsetToCentre(box(1200), SCREEN, 500)).toBeCloseTo(500 + 1200 - 377);
  });

  it('never scrolls above the top of the list', () => {
    expect(offsetToCentre(box(-50), SCREEN, 0)).toBe(0);
  });

  it('keeps a tall target below the top margin rather than centring it away', () => {
    const tall = box(500, { height: 2000 });
    expect(offsetToCentre(tall, SCREEN, 0)).toBeCloseTo(500 - IN_VIEW_MARGIN_PX);
  });
});
