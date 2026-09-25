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
 * THE THREE SHAPES.
 *
 * ⚠️ YOU CANNOT WRAP SOMETHING BOLTED TO THE TOP EDGE, and trying looks like a
 * bug. Docking is the honest answer and still reads as belonging to the
 * hardware.
 *
 * ⚠️ AND `none` GETS THE VISOR — §5.5, NOT a card floating below the status
 * bar. It is the MOST COMMON form, not the exception: every Android phone
 * without the native module, every iPhone SE, every tablet, every
 * under-display camera. If it looks wrong, the feature looks wrong.
 *
 * The visor does not float — it makes a notch. It is flush with the top edge,
 * its upper band IS the status-bar strip and is black, and the content row
 * sits in the lower band. The app grows its own cutout and the island lives in
 * it: same object, same black, same ink, same ladder, born from the edge
 * instead of around a lens.
 */
export type Shape = 'wrap' | 'dock' | 'visor';

export function shapeFor(kind: CutoutKind): Shape {
  return kind === 'floating' ? 'wrap' : kind === 'edge' ? 'dock' : 'visor';
}

/** The content row under a visor's status-bar band. */
export const VISOR_ROW = 34;
/** ⚠️ The visor's bottom corners. The top ones are square — it is flush. */
export const VISOR_RADIUS = 26;
/**
 * ⚠️ A VISOR MAY NOT REACH THE STATUS-BAR CONTENT — §5.5. About 90pt each side
 * for the clock and the battery. On a 390pt phone that caps the visor at
 * 210pt, about twenty characters, so the dropped form is common here too: a
 * message that needs more DROPS rather than widening into the clock.
 */
export function visorCap(screenW: number): number {
  return screenW - 180;
}

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
  /** The two places content may go in the head row. Zero for dock and rect. */
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
 * ⚠️ `rect` TAKES ITS `y` FROM THE SAFE AREA, NEVER A CONSTANT — §5.2. A
 * literal 12 lands on top of the clock and the battery on an iPhone SE, whose
 * status bar occupies 0 → 20. `wrap` and `dock` are already safe because they
 * derive `y` from the cutout, which is above or inside that strip by
 * definition; `rect` has no cutout to derive anything from, which is exactly
 * why it was the one that got it wrong.
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
  if (shape === 'dock') {
    /* ⚠️ UNDER the cutout, never across it, and centred on the cutout itself. */
    const w = 0;
    return { x: hole.x + hole.w / 2 - w / 2, y: hole.y + hole.h + 8, w, h: 36, radiusTop: 999, radiusBottom: 999 };
  }
  /*
    ⚠️ THE VISOR IS FLUSH — `y: 0`, NO GAP, EVER. A gap makes it a card
    hovering under the status bar, which is the thing it is not.
  */
  return {
    x: screenW / 2,
    y: 0,
    w: 0,
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
  const centre = hole.kind === 'none' ? screenW / 2 : hole.x + hole.w / 2;
  return clamp(centre - w / 2, EDGE, Math.max(EDGE, screenW - EDGE - w));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** The two slots at a given box width — §3. */
function slots(w: number, hole: Cutout, screenW: number): { left: number; right: number } {
  /*
    ⚠️ ONLY A `wrap` HAS SLOTS. A dock sits UNDER the cutout and a rect has no
    cutout at all, so in both the head row is one uninterrupted line — giving
    them slots would split a row that has nothing in the middle of it.
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
  /** ⚠️ `rect` needs it — §5.2. */
  topInset?: number;
}): Layout {
  const { hole, screenW, measured: m, topInset = 0 } = input;
  const shape = shapeFor(hole.kind);
  const sealed = sealedBox(hole, screenW, topInset);
  const capW = Math.min(CAP, screenW - EDGE * 2);
  const natural = Math.min(naturalWidth(m, hole), capW);

  const headH = shape === 'visor' ? VISOR_ROW : sealed.h;
  const headTop = shape === 'visor' ? topInset : 0;

  const openBox = (w: number, rung: Rung, lines: number): Box => ({
    x: placeX(w, hole, screenW),
    y: sealed.y,
    w,
    h: rung >= 3 ? droppedHeight(sealed.h, m, lines) : sealed.h,
    /*
      ⚠️ SHAPE FIRST, THEN RUNG — §5.3. Asking the rung first gave a dropped
      card a radius of 30, which makes it ROUNDER as it grows. `wrap` and
      `dock` are pills, so 999 → 30 is the pill becoming a panel, which is the
      point.

      ⚠️ AND A VISOR NEVER GROWS A TOP. It is flush with the edge; a rounded
      top corner would lift it off the bezel and turn it back into a card.
    */
    radiusTop: shape === 'visor' ? 0 : rung >= 3 ? 30 : 999,
    radiusBottom: shape === 'visor' ? VISOR_RADIUS : rung >= 3 ? 30 : 999,
  });

  const shell = (rung: Rung, w: number, left: number, right: number, icon: Layout['icon'], drops: boolean): Layout => ({
    rung, shape, sealed,
    open: openBox(w, rung, drops ? titleLines(m, w) : 0),
    left, right, icon, titleDrops: drops, headTop, headHeight: headH,
  });

  /*
    A dock or a visor has no lens in its row, so the ladder is only ever about
    whether the sentence fits — and a visor is capped short of the clock and
    the battery, which is why the dropped form is common there too.
  */
  if (hole.kind !== 'floating') {
    const widest = shape === 'visor' ? Math.min(capW, visorCap(screenW)) : capW;
    const room = widest - SIDE * 2 - ICON - ICON_GAP - m.value - 24;
    if (m.title <= room) {
      const w = Math.min(natural, widest);
      const rung: Rung = w < widest ? 1 : 2;
      return shell(rung, w, 0, 0, 'left', false);
    }
    /* ⚠️ It DROPS rather than widening into the status bar. */
    return shell(m.bodyLines > 0 ? 4 : 3, widest, 0, 0, 'left', true);
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
 * ⚠️ WHAT A DOCKED OR VISORED ISLAND LANDS ON — §5.1 and §5.5, and it does not
 * apply to `wrap` at all.
 *
 * On an iPhone 13 the island docks at `y: 38` height 36 while the safe area
 * starts at 47, so it sits on the first 27pt of the app's own content. A
 * visor's whole lower band is app content by definition.
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
export function reserveFor(box: Box, shape: Shape, topInset: number): number {
  if (shape === 'wrap') return 0;
  return Math.max(0, box.y + box.h + 8 - topInset);
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
