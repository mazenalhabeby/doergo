/**
 * THE GEOMETRY — measured, never assumed, and decided ONCE before anything
 * animates.
 *
 * ⚠️ THE ONE LAW: THE CAMERA COVERS NOTHING, EVER. The cutout rectangle, plus
 * 6pt on each side, is not a layout area. Every rule in this file exists to
 * serve that one.
 *
 * Pure on purpose: the ladder is the part that is wrong on one phone in ten
 * and invisible on the other nine, so it is decided here where it can be
 * tested against every camera in the spec rather than inside a component that
 * only ever runs on the simulator in front of us.
 */

export type CutoutKind = 'floating' | 'edge' | 'none';

/** Physical cutout, in points, from the top-left of the screen. */
export interface Cutout {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: CutoutKind;
}

export const PAD = 10;
export const GAP = 6;
export const SIDE = 13;
export const ICON = 21;
export const ICON_GAP = 9;
/** ⚠️ Past this it stops being a notification and becomes a banner. */
export const CAP = 356;
export const EDGE = 8;
/** ⚠️ The fourth line becomes "Open" — the drawing, §the cap. */
export const MAX_BODY_LINES = 3;

/**
 * TWO SHAPES. ⚠️ THERE IS NO `dock` — it was a mistake and the visor replaces
 * it (§5).
 *
 * `dock` put the island 8pt BELOW the cutout, and that gap is the entire
 * problem: a black pill hovering under the status bar with daylight above it
 * is the toast this design replaced. It shipped in `9845c93b` and it is what
 * the screenshots kept showing.
 *
 * ⚠️ AN `edge` CUTOUT AND NO CUTOUT AT ALL ARE THE SAME SHAPE. In both, the
 * island is flush with the top of the screen and its content row sits below
 * the status-bar band. The only difference is that on an `edge` device part of
 * that black is the hardware's and on a `none` device all of it is the app's.
 * Neither needs a gap, because in neither case is the island an object
 * floating near the top — IT IS THE TOP.
 *
 * ⚠️ AND THE VISOR IS THE COMMON FORM, NOT THE EXCEPTION: every notch iPhone,
 * every teardrop Android, every Android phone without the native module, every
 * SE, every tablet, every under-display camera. ONLY A FLOATING CUTOUT GETS
 * `wrap`, because 126 × 37 is identical on every Dynamic Island iPhone and is
 * the one cutout constant that is not a guess.
 *
 * ⚠️ THE COST, STATED PLAINLY: on a notch iPhone you do not get the island
 * effect. You get a black top bar that holds the shift. It is correct on every
 * phone ever made and needs no per-model table. The island effect lives where
 * it is the truth rather than a guess.
 */
export type Shape = 'wrap' | 'visor';

export function shapeFor(kind: CutoutKind): Shape {
  return kind === 'floating' ? 'wrap' : 'visor';
}

/**
 * THE VISOR'S CONTENT ROW. Its height is the only figure the visor needs.
 *
 * ⚠️ EVERYTHING THAT TRIED TO MATCH THE CUTOUT IS DELETED — §5.5, rewritten.
 * `visorCap()`, the `screenW - 180` rule, `VISOR_MIN`, the measured band and
 * the centred row were all attempts to make the visor hug a cutout, and that
 * cannot be done: `hole` is FABRICATED on iOS. `{x: 90.5, w: 209}` is §2's
 * constant centred on a 390pt screen, and 209 came from an iPhone XR — iOS
 * exposes no API for the cutout rectangle at all. The running app measured
 * `open.w: 130.57` against a claimed 209pt notch: a small black tab dangling
 * off a wider black shape. No height or centring change fixes that, because
 * it was never a height problem.
 *
 * ⚠️ SO THE VISOR MATCHES NOTHING, AND THEREFORE CANNOT BE THE WRONG WIDTH.
 * It is full-width black chrome that CONTAINS the notch instead of extending
 * it. Only a floating cutout gets `wrap`, because 126 × 37 is identical on
 * every Dynamic Island iPhone and is the one constant that is safe.
 */
export const VISOR_ROW = 34;

/** ⚠️ The visor's bottom corners. The top ones are square — it is flush. */
export const VISOR_RADIUS = 26;

/**
 * THE LADDER — the first rung that fits wins.
 *
 * ⚠️ RUNG 3 IS THE NORMAL FORM ON IPHONE, NOT THE EXCEPTION. On a Dynamic
 * Island the slots are 96pt each; minus the icon and its gap the title gets
 * 66pt — about nine characters — and `Clocked in` measures 67. It does not
 * fit. The dropped layout is the one to build and test first; the one-line
 * form is the lucky case a large centred punch-hole happens to allow.
 */
export type Rung = 1 | 2 | 3 | 4 | 5;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** ⚠️ Square on a visor — it is flush with the edge, so it has no top. */
  radiusTop: number;
  radiusBottom: number;
}

export interface Layout {
  rung: Rung;
  shape: Shape;
  /** Sealed — what it collapses back to. */
  sealed: Box;
  /** Open — what it animates to. */
  open: Box;
  /** The two places content may go in the head row. ⚠️ Zero on a visor. */
  left: number;
  right: number;
  /** Where the icon sits in the head row. */
  icon: 'left' | 'right' | 'none';
  /** ⚠️ Rung 3+ — the title is BELOW the lens, not beside it. */
  titleDrops: boolean;
  /**
   * Where the head row starts inside the box.
   *
   * ⚠️ NOT ZERO ON A VISOR. Its upper band is the status-bar strip and holds
   * nothing — the content row is below it, or the message sits on the clock.
   */
  headTop: number;
  /** The head row's own height, which is not the sealed box's on a visor. */
  headHeight: number;
}

export interface Measured {
  /** Rendered width of the title at its real size and weight. */
  title: number;
  /** Rendered width of the trailing value (mono). */
  value: number;
  /** How many lines the body needs at the open width. 0 = no body. */
  bodyLines: number;
  /** There is something to press. */
  action: boolean;
}

/* Line boxes, so the open height is decided rather than discovered. */
const TITLE_LH = 21;
const BODY_LH = 19;
const ACTION_H = 30;
const DROP_GAP = 8;
const BOTTOM = 14;

/**
 * The sealed capsule — what the island is when it has nothing to say.
 *
 * ⚠️ A VISOR IS NEVER SEALED TO NOTHING. It is chrome: `screenW` wide and
 * `topInset + 34` tall whether it is saying anything or not. Only its CONTENT
 * comes and goes — §5.5.2.
 */
export function sealedBox(hole: Cutout, screenW: number, topInset = 0): Box {
  const shape = shapeFor(hole.kind);
  if (shape === 'wrap') {
    return {
      x: hole.x - PAD,
      y: Math.max(hole.y - PAD, 6),
      w: hole.w + PAD * 2,
      h: Math.max(hole.h + 20, 34),
      radiusTop: 999,
      radiusBottom: 999,
    };
  }
  /*
    ⚠️ EDGE TO EDGE, FLUSH WITH THE TOP. The band above the content row holds
    the status bar and, on a notch phone, the notch itself — whatever size it
    really is. It contains the cutout instead of extending it, which is why
    it cannot be the wrong width.
  */
  return {
    x: 0,
    y: 0,
    w: screenW,
    h: topInset + VISOR_ROW,
    radiusTop: 0,
    radiusBottom: VISOR_RADIUS,
  };
}


/**
 * ⚠️ THE LENS NEVER MOVES. The box is anchored to the HOLE'S centre, not its
 * own, so left and right grow at the same rate. If the camera appears to
 * slide, the illusion dies in one frame — and it is also why `x` is computed
 * from the width rather than the width from `x`.
 */
function placeX(w: number, hole: Cutout, screenW: number): number {
  /*
    ⚠️ A VISOR IS CENTRED ON THE SCREEN — §5.5's own `clamp(screenW / 2 - w / 2,
    …)`. Only a `wrap` is anchored to the hole, because only a `wrap` has to
    keep a lens from appearing to slide.
  */
  const centre = hole.kind === 'floating' ? hole.x + hole.w / 2 : screenW / 2;
  return clamp(centre - w / 2, EDGE, Math.max(EDGE, screenW - EDGE - w));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** The two slots at a given box width — §3. */
function slots(w: number, hole: Cutout, screenW: number): { left: number; right: number } {
  /*
    ⚠️ ONLY A `wrap` HAS SLOTS. A visor's content row sits BELOW the black
    band, so nothing is in the middle of it — giving it slots would split a
    row that has no lens crossing it.
  */
  if (hole.kind !== 'floating') return { left: 0, right: 0 };
  const x = placeX(w, hole, screenW);
  return {
    left: hole.x - GAP - (x + SIDE),
    right: x + w - SIDE - (hole.x + hole.w + GAP),
  };
}

/** Natural width before clamping to the cap — §4. */
function naturalWidth(m: Measured, hole: Cutout): number {
  const lens = hole.kind === 'floating' ? hole.w + GAP * 2 : 0;
  return SIDE * 2 + ICON + ICON_GAP + m.title + lens + m.value + 24;
}

export function readLayout(input: {
  hole: Cutout;
  screenW: number;
  measured: Measured;
  /** ⚠️ The visor's band is the status bar — §5.5. */
  topInset?: number;
}): Layout {
  const { hole, screenW, measured: m, topInset = 0 } = input;
  const shape = shapeFor(hole.kind);
  const sealed = sealedBox(hole, screenW, topInset);
  const capW = Math.min(CAP, screenW - EDGE * 2);
  const natural = Math.min(naturalWidth(m, hole), capW);

  const openBox = (w: number, rung: Rung, lines: number): Box => ({
    x: placeX(w, hole, screenW),
    y: sealed.y,
    w,
    h: rung >= 3 ? droppedHeight(sealed.h, m, lines) : sealed.h,
    /*
      ⚠️ SHAPE FIRST, THEN RUNG — §5.3. Asking the rung first gave a dropped
      card a radius of 30, which makes it ROUNDER as it grows. A `wrap` is a
      pill, so 999 → 30 is the pill becoming a panel, which is the point.
    */
    radiusTop: rung >= 3 ? 30 : 999,
    radiusBottom: rung >= 3 ? 30 : 999,
  });

  const shell = (rung: Rung, w: number, left: number, right: number, icon: Layout['icon'], drops: boolean): Layout => ({
    rung, shape, sealed,
    open: openBox(w, rung, drops ? titleLines(m, w) : 0),
    left, right, icon, titleDrops: drops, headTop: 0, headHeight: sealed.h,
  });

  /*
    ⚠️ ON A VISOR THE LADDER COLLAPSES — §5.5.2. The row has `screenW - 26` of
    usable width, about 320pt on a 390pt phone, so one line is almost always
    the answer. There is no dead zone to route around and no cap to run into,
    because the visor matches nothing.

    ⚠️ AND A TITLE THAT STILL WILL NOT FIT WRAPS INSIDE THE SAME BAR. It does
    not drop below a lens — there is no lens — so the bar simply grows by one
    `VISOR_ROW` per line and NOTHING ELSE MOVES.
  */
  if (shape === 'visor') {
    const room = Math.max(1, screenW - SIDE * 2 - ICON - ICON_GAP - m.value - 24);
    const lines = Math.max(1, Math.ceil(m.title / room));
    const body = m.bodyLines > 0 ? 6 + Math.min(m.bodyLines, MAX_BODY_LINES) * 19 : 0;
    const action = m.action ? 10 + 30 : 0;
    return {
      rung: lines > 1 ? (m.bodyLines > 0 ? 4 : 3) : 1,
      shape,
      sealed,
      open: {
        x: 0,
        y: 0,
        w: screenW,
        h: topInset + VISOR_ROW * lines + body + action,
        radiusTop: 0,
        radiusBottom: VISOR_RADIUS,
      },
      left: 0,
      right: 0,
      icon: 'left',
      /* ⚠️ The title stays in the row and wraps; it never drops below a lens. */
      titleDrops: false,
      /* The content row sits below the status bar, which the band holds. */
      headTop: topInset,
      headHeight: VISOR_ROW * lines,
    };
  }

  const fitsIn = (w: number) => ICON + ICON_GAP + m.title <= slots(w, hole, screenW).left;

  /* ① at natural width. */
  if (fitsIn(natural)) {
    const s2 = slots(natural, hole, screenW);
    return shell(1, natural, s2.left, s2.right, 'left', false);
  }
  /* ② once grown to the cap. */
  if (fitsIn(capW)) {
    const s2 = slots(capW, hole, screenW);
    return shell(2, capW, s2.left, s2.right, 'left', false);
  }

  const s3 = slots(capW, hole, screenW);
  /*
    ⑤ A HARD-LEFT CAMERA. A hole at x=22 leaves a left slot of about −5pt —
    not even the icon fits, so it moves to the right slot and everything drops.
  */
  if (ICON > s3.left) {
    return shell(5, capW, s3.left, s3.right, s3.right >= ICON ? 'right' : 'none', true);
  }
  /* ③, or ④ when there is a body under it. */
  return shell(m.bodyLines > 0 ? 4 : 3, capW, s3.left, s3.right, 'left', true);
}

/**
 * ⚠️ WHAT A VISOR LANDS ON — §5.1 and §5.5, and it does not apply to `wrap`
 * at all.
 *
 * A visor's lower band is app content by definition: the black reaches down
 * past the status bar and the content row sits in what the screen would
 * otherwise be using.
 *
 * For a message that leaves after four seconds that is fine — it is a
 * notification and it is allowed to be on top. ⚠️ FOR THE PERSISTENT LIVE
 * SHIFT IT IS NOT: a pill that sits on the header forever is the exact fault
 * this design replaced, and the first cut shipped it, with the ring parked on
 * `Friday, September 25` all day.
 *
 * ⚠️ TRANSIENT MESSAGES FLOAT; ONLY THE LIVE STATE RESERVES. Nudging the whole
 * app down and back for four seconds every time something happens is worse
 * than the overlap it would fix.
 */
export function reserveFor(shape: Shape): number {
  /*
    ⚠️ A CONSTANT, BECAUSE THE VISOR'S GEOMETRY IS ONE — §5.5.3. It is
    `topInset + VISOR_ROW + 8 - topInset`, which is `VISOR_ROW + 8`: the app
    simply starts 42pt lower during a shift, which is honest, because that
    area is the visor's.
  */
  return shape === 'wrap' ? 0 : VISOR_ROW + 8;
}

/** How many lines the dropped title needs across the open width. */
export function titleLines(m: Measured, w: number): number {
  const room = Math.max(1, w - SIDE * 2);
  return Math.max(1, Math.ceil(m.title / room));
}

/**
 * ⚠️ DECIDED, NOT DISCOVERED. The height is computed from the line boxes
 * before anything moves, because re-measuring mid-flight is what makes cheap
 * versions look cheap — §8 rule 3.
 */
export function droppedHeight(headH: number, m: Measured, lines: number): number {
  const body = m.bodyLines > 0 ? 6 + Math.min(m.bodyLines, MAX_BODY_LINES) * BODY_LH : 0;
  const action = m.action ? 10 + ACTION_H : 0;
  return headH + DROP_GAP + lines * TITLE_LH + body + action + BOTTOM;
}
