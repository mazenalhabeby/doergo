/**
 * THE GEOMETRY — decided ONCE, from this phone's cutout, before anything
 * animates.
 *
 * ONE SHAPE ON EVERY PHONE. The island is born AT the cutout — the notch, the
 * Dynamic Island, the punch hole — at exactly its size, and grows out of it
 * left and right. The icon sits in the left slot beside the lens, the time in
 * the right slot. Whatever does not fit beside the lens goes UNDER it, and the
 * height is whatever that content needs.
 *
 * ⚠️ THE ONE LAW: THE CAMERA COVERS NOTHING, EVER. The cutout rectangle, plus
 * `GAP` on each side, is not a layout area.
 *
 * Pure on purpose, so every phone in the table can be tested here.
 */

/**
 * - `floating` — a lens with screen above it: Dynamic Island, punch hole.
 * - `edge`     — a lens bolted to the top edge: the notch.
 * - `none`     — no lens (iPhone SE). The island grows from a dot.
 */
export type CutoutKind = 'floating' | 'edge' | 'none';

/** The cutout, in points, from the top-left of the screen. */
export interface Cutout {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: CutoutKind;
  /**
   * ⚠️ TRUE WHEN THE LENS IS INFERRED, NOT MEASURED (an Android phone with no
   * cutout module). Its island still grows from there, but nothing is drawn
   * there while idle — a black dot over a camera that may not exist.
   */
  assumed?: boolean;
}

export const PAD = 10;
export const GAP = 6;
export const SIDE = 18;
/** Side padding of the text UNDER the lens. */
export const DROP_SIDE = SIDE;
export const ICON = 22;
export const ICON_GAP = 9;
/** ⚠️ Past this it stops being a notification and becomes a banner. */
export const CAP = 372;
export const EDGE = 8;
/** ⚠️ The fourth line becomes "Open". */
export const MAX_BODY_LINES = 4;
/** A phone with no lens grows from a dot this size, just under the status bar. */
export const DOT = 36;

/** One head row, whatever the phone. */
export type Rung = 1 | 2 | 3 | 4 | 5;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** ⚠️ Square on a notch — it is flush with the top edge. */
  radiusTop: number;
  radiusBottom: number;
}

export interface Layout {
  rung: Rung;
  /** Where it is born and where it goes back to. */
  sealed: Box;
  /** What it grows to. */
  open: Box;
  /** The two places content may go beside the lens. */
  left: number;
  right: number;
  /** Where the icon sits in the head row. */
  icon: 'left' | 'right' | 'none';
  /** ⚠️ Rung 3+ — the title is UNDER the lens, not beside it. */
  titleDrops: boolean;
  /** Where the head row starts inside the box. */
  headTop: number;
  /** The head row's height — the band the lens sits in. */
  headHeight: number;
  /** The lens inside the head row, relative to the box. Zero width = none. */
  lens: { x: number; w: number };
}

export interface Measured {
  /** Rendered width of the title at its real size and weight. */
  title: number;
  /** Rendered width of the trailing value (mono). */
  value: number;
  /** How many lines the body needs at the open width. 0 = no body. */
  bodyLines: number;
  /**
   * ⚠️ How many lines the title REALLY wraps to under the lens, measured at
   * that width. Dividing its one-line width by the row width undercounts —
   * words do not break mid-word — and cut the last line off (05.png).
   */
  titleWrapped?: number;
  /** There is something to press. */
  action: boolean;
}

/* Line boxes, so the open height is decided rather than discovered. */
/* ⚠️ These mirror `styles.drop` / `title` / `body` in island-view.tsx exactly. */
const TITLE_LH = 21;
const BODY_LH = 19;
const ACTION_H = 30;
const DROP_TOP = 4;
const LINE_GAP = 3;
const BOTTOM = 16;

/**
 * THE SEALED BOX — the cutout itself, which is where the island is born and
 * where it goes back to.
 *
 * - Dynamic Island / punch hole: a pill `PAD` larger than the lens.
 * - Notch: EXACTLY the notch — square top, rounded bottom. Black on black, so
 *   the first frame is invisible and the island appears to grow OUT of it.
 * - No lens: a dot just under the status bar.
 */
export function sealedBox(hole: Cutout, _screenW: number, topInset = 0): Box {
  if (hole.kind === 'floating') {
    return {
      x: hole.x - PAD,
      y: Math.max(hole.y - PAD, 4),
      w: hole.w + PAD * 2,
      h: Math.max(hole.h + 20, 34),
      radiusTop: 999,
      radiusBottom: 999,
    };
  }
  if (hole.kind === 'edge') {
    return {
      x: hole.x,
      y: 0,
      w: hole.w,
      h: hole.h,
      radiusTop: 0,
      radiusBottom: Math.min(20, hole.h / 2),
    };
  }
  return {
    x: hole.x - DOT / 2,
    y: topInset + 6,
    w: DOT,
    h: DOT,
    radiusTop: 999,
    radiusBottom: 999,
  };
}

/** ⚠️ Idle, only a MEASURED floating lens keeps its pill. Everything else is not drawn. */
export function sealedVisible(hole: Cutout): boolean {
  return hole.kind === 'floating' && !hole.assumed;
}

/**
 * ⚠️ THE LENS NEVER MOVES. The box grows from the hole's centre, so left and
 * right grow at the same rate.
 */
function placeX(w: number, hole: Cutout, screenW: number): number {
  const centre = hole.x + hole.w / 2;
  return clamp(centre - w / 2, EDGE, Math.max(EDGE, screenW - EDGE - w));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** The room beside the lens at a given box width. */
function slots(w: number, hole: Cutout, screenW: number): { left: number; right: number } {
  const x = placeX(w, hole, screenW);
  const gap = hole.w > 0 ? GAP : 0;
  return {
    left: hole.x - gap - (x + SIDE),
    right: x + w - SIDE - (hole.x + hole.w + gap),
  };
}

/** Natural width before clamping to the cap. */
function naturalWidth(m: Measured, hole: Cutout): number {
  const lens = hole.w > 0 ? hole.w + GAP * 2 : 0;
  /* Symmetric around the lens: each side holds the wider of its two sides. */
  const leftNeed = ICON + (m.title > 0 ? ICON_GAP + m.title : 0);
  const rightNeed = m.value;
  return SIDE * 2 + lens + Math.max(leftNeed, rightNeed) * 2 + 8;
}

export function readLayout(input: {
  hole: Cutout;
  screenW: number;
  measured: Measured;
  topInset?: number;
}): Layout {
  const { hole, screenW, measured: m, topInset = 0 } = input;
  const sealed = sealedBox(hole, screenW, topInset);
  const capW = Math.min(CAP, screenW - EDGE * 2);
  const natural = Math.min(naturalWidth(m, hole), capW);
  /* The head row is the band the lens occupies — the notch's height on a notch. */
  const headHeight = hole.kind === 'edge' ? Math.max(hole.h, 30) : sealed.h;

  const fitsIn = (w: number) => {
    const s = slots(w, hole, screenW);
    /* ⚠️ No title, no gap after the icon. */
    return ICON + (m.title > 0 ? ICON_GAP + m.title : 0) <= s.left && m.value <= s.right;
  };

  const shell = (rung: Rung, w: number, icon: Layout['icon'], drops: boolean): Layout => {
    const s = slots(w, hole, screenW);
    const x = placeX(w, hole, screenW);
    const tall = drops || m.bodyLines > 0 || m.action;
    const edge = hole.kind === 'edge';
    return {
      rung,
      sealed,
      open: {
        x,
        y: sealed.y,
        w,
        h: tall ? droppedHeight(headHeight, m, drops ? titleLines(m, w) : 0) : headHeight,
        radiusTop: edge ? 0 : tall ? 30 : 999,
        radiusBottom: edge ? (tall ? 30 : 20) : tall ? 30 : 999,
      },
      left: s.left,
      right: s.right,
      icon,
      titleDrops: drops,
      headTop: 0,
      headHeight,
      lens: { x: hole.x - x, w: hole.w },
    };
  };

  /* ① Everything beside the lens, at natural width. */
  if (fitsIn(natural) && m.bodyLines === 0 && !m.action) return shell(1, natural, 'left', false);
  /* ② Beside the lens once grown to the cap. */
  if (fitsIn(capW)) return shell(m.bodyLines > 0 || m.action ? 4 : 2, capW, 'left', false);

  const s3 = slots(capW, hole, screenW);
  /* ⑤ A hard-left camera: not even the icon fits on the left. */
  if (ICON > s3.left) return shell(5, capW, s3.right >= ICON ? 'right' : 'none', true);
  /* ③ The title goes under the lens; ④ with a body too. */
  return shell(m.bodyLines > 0 ? 4 : 3, capW, 'left', true);
}

/**
 * ⚠️ iOS AND ANDROID DRAW THE STATUS BAR ABOVE THE APP. An island grown past
 * the lens sits under the clock and the battery, which then print on top of
 * it — so while it is open the status bar is hidden. On a phone with no lens
 * the island is below the status bar and nothing needs hiding.
 */
export function coversStatusBar(hole: Cutout): boolean {
  return hole.kind !== 'none';
}

/** How many lines the dropped title needs across the open width. */
function titleLines(m: Measured, w: number): number {
  if (m.titleWrapped && m.titleWrapped > 0) return m.titleWrapped;
  const room = Math.max(1, w - DROP_SIDE * 2);
  return Math.max(1, Math.ceil(m.title / room));
}

/**
 * ⚠️ DECIDED, NOT DISCOVERED. The height comes from the line boxes before
 * anything moves.
 */
function droppedHeight(headH: number, m: Measured, lines: number): number {
  const blocks = [
    lines > 0 ? lines * TITLE_LH : 0,
    m.bodyLines > 0 ? Math.min(m.bodyLines, MAX_BODY_LINES) * BODY_LH : 0,
    m.action ? 4 + ACTION_H : 0,
  ].filter((b) => b > 0);
  const gaps = Math.max(0, blocks.length - 1) * LINE_GAP;
  return headH + DROP_TOP + blocks.reduce((a, b) => a + b, 0) + gaps + BOTTOM;
}
