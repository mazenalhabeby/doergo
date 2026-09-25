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
 * hardware. `rect` takes radius 22 so it reads as a deliberate card rather
 * than a pill floating next to nothing.
 */
export type Shape = 'wrap' | 'dock' | 'rect';

export function shapeFor(kind: CutoutKind): Shape {
  return kind === 'floating' ? 'wrap' : kind === 'edge' ? 'dock' : 'rect';
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
  radius: number;
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
      radius: 999,
    };
  }
  if (shape === 'dock') {
    /* ⚠️ UNDER the cutout, never across it, and centred on the cutout itself. */
    const w = 0;
    return { x: hole.x + hole.w / 2 - w / 2, y: hole.y + hole.h + 8, w, h: 36, radius: 999 };
  }
  return { x: screenW / 2, y: topInset + 8, w: 0, h: 40, radius: 22 };
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

  const openBox = (w: number, rung: Rung, lines: number): Box => ({
    x: placeX(w, hole, screenW),
    y: sealed.y,
    w,
    h: rung >= 3 ? droppedHeight(sealed.h, m, lines) : sealed.h,
    /*
      ⚠️ SHAPE FIRST, THEN RUNG — §5.3. Asking the rung first gave a dropped
      `rect` a radius of 30, which makes it ROUNDER as it grows. `wrap` and
      `dock` are pills, so 999 → 30 is the pill becoming a panel, which is the
      point. A `rect` was never a pill: it is already a card, and dropping
      does not change what it is.
    */
    radius: shape === 'rect' ? 22 : rung >= 3 ? 30 : 999,
  });

  /*
    A dock or a rect has no lens in its row, so the ladder is only ever about
    whether the sentence fits the cap.
  */
  if (hole.kind !== 'floating') {
    const room = capW - SIDE * 2 - ICON - ICON_GAP - m.value - 24;
    if (m.title <= room) {
      const rung: Rung = natural <= room + SIDE * 2 + ICON + ICON_GAP + m.value + 24 ? 1 : 2;
      const w = rung === 1 ? natural : capW;
      return { rung, shape, sealed, open: openBox(w, rung, 0), left: 0, right: 0, icon: 'left', titleDrops: false };
    }
    const rung: Rung = m.bodyLines > 0 ? 4 : 3;
    return { rung, shape, sealed, open: openBox(capW, rung, titleLines(m, capW)), left: 0, right: 0, icon: 'left', titleDrops: true };
  }

  const fitsIn = (w: number) => ICON + ICON_GAP + m.title <= slots(w, hole, screenW).left;

  /* ① at natural width. */
  if (fitsIn(natural)) {
    const s = slots(natural, hole, screenW);
    return { rung: 1, shape, sealed, open: openBox(natural, 1, 0), left: s.left, right: s.right, icon: 'left', titleDrops: false };
  }
  /* ② once grown to the cap. */
  if (fitsIn(capW)) {
    const s = slots(capW, hole, screenW);
    return { rung: 2, shape, sealed, open: openBox(capW, 2, 0), left: s.left, right: s.right, icon: 'left', titleDrops: false };
  }

  const s = slots(capW, hole, screenW);
  /*
    ⑤ A HARD-LEFT CAMERA. A hole at x=22 leaves a left slot of about −5pt —
    not even the icon fits, so it moves to the right slot and everything drops.
  */
  if (ICON > s.left) {
    return {
      rung: 5, shape, sealed,
      open: openBox(capW, 5, titleLines(m, capW)),
      left: s.left, right: s.right,
      icon: s.right >= ICON ? 'right' : 'none',
      titleDrops: true,
    };
  }
  /* ③, or ④ when there is a body under it. */
  const rung: Rung = m.bodyLines > 0 ? 4 : 3;
  return { rung, shape, sealed, open: openBox(capW, rung, titleLines(m, capW)), left: s.left, right: s.right, icon: 'left', titleDrops: true };
}

/**
 * ⚠️ WHAT A DOCKED ISLAND LANDS ON — §5.1, and it only bites on `dock` and
 * `rect`.
 *
 * On an iPhone 13 the notch is `y: 0 → 30`, so the island docks at `y: 38`,
 * height 36, occupying 38 → 74. The safe-area top inset is 47, so it overlaps
 * the first 27pt of the app's own content.
 *
 * For a message that leaves after four seconds that is fine — it is a
 * notification and it is allowed to be on top. ⚠️ FOR THE PERSISTENT LIVE
 * SHIFT IT IS NOT. A pill that sits on the header forever is the exact fault
 * this design was built to fix in the old toast, and it is what the first cut
 * shipped: the ring covered `Friday, September 25` on the home screen, all
 * day.
 *
 * So on `dock` and `rect` the live state RESERVES the space instead of
 * floating over it. ⚠️ On `wrap` it never needs to, because it is inside the
 * cutout area the app already avoids — and ⚠️ a transient message never
 * reserves anything, or the whole app would nudge down for four seconds every
 * time something happened.
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
