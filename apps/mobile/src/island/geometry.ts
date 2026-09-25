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
 * `wrap`. If the visor looks wrong, the feature looks wrong on almost every
 * device.
 */
export type Shape = 'wrap' | 'visor';

export function shapeFor(kind: CutoutKind): Shape {
  return kind === 'floating' ? 'wrap' : 'visor';
}

/**
 * ⚠️ THE VISOR'S OWN HEIGHT — NOT `insets.top + 34`.
 *
 * An earlier version of §5.5 said the content row was pushed below the
 * status-bar band, and that is what shipped in `c1145217`: on a notch phone
 * `44 + 34 = 78pt` of black hanging off the top edge with the message pinned
 * to the bottom of it — a slab, not an island. The band was belt-and-braces
 * for a collision that cannot happen.
 *
 * ⚠️ NOTHING NEEDS TO CLEAR THE STATUS BAR VERTICALLY, BECAUSE IT IS ALREADY
 * CLEARED HORIZONTALLY. The clock is at the far left, the battery at the far
 * right, and the visor is centred and capped short of both — `visorCap` is
 * the rule doing the real work. So the content row is LEVEL with them, exactly
 * as a Dynamic Island is.
 */
export const VISOR_MIN = 44;

/** The content row itself, when a cutout forces the visor to grow past it. */
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
 * ⚠️ NO SAFE-AREA INSET IN HERE. §5.2's bug was a literal `y: 12` landing on
 * the clock and the battery; the fix was not to thread the inset through but
 * to notice that a visor starts AT the edge and is cleared HORIZONTALLY —
 * see `VISOR_MIN`. An inset in this function is the 78pt slab coming back.
 */
export function sealedBox(hole: Cutout, screenW: number): Box {
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
    ⚠️ THE VISOR IS FLUSH — `y: 0`, NO GAP, EVER. ⚠️ NEVER
    `hole.y + hole.h + 8`: any gap at all and it stops being the top of the
    screen and becomes a card near it, which is the toast again.

    ⚠️ AND THE BAND CLEARS BOTH THE STATUS BAR AND THE HARDWARE. On an `edge`
    device the notch or teardrop is already black, so the visor is drawn at the
    same `y: 0` and simply merges with it — one continuous black form from the
    top of the screen down to its rounded bottom edge.
  */
  return {
    x: screenW / 2,
    y: 0,
    w: 0,
    h: visorHeight(hole, screenW),
    radiusTop: 0,
    radiusBottom: VISOR_RADIUS,
  };
}

/**
 * DOES THE CUTOUT ACTUALLY INTRUDE INTO THE VISOR?
 *
 * ⚠️ MEASURED PER DEVICE, NOT ASSUMED FROM THE KIND. `edge` covers a 209pt
 * notch and a 60pt teardrop and whatever the next phone ships; the question
 * that matters is whether THIS cutout overlaps the width THIS visor can
 * occupy, and that is arithmetic, not a category.
 *
 * ⚠️ AND IT IS ASKED AT THE VISOR'S WIDEST, not at the current message's
 * width. A band that changed with the sentence would move the island up and
 * down between messages, which is the lens-appears-to-slide mistake in the
 * other axis.
 */
export function cutoutIntrudes(hole: Cutout, screenW: number): boolean {
  if (hole.kind === 'none' || hole.w <= 0) return false;
  const w = Math.min(CAP, screenW - EDGE * 2, visorCap(screenW));
  const left = clamp(screenW / 2 - w / 2, EDGE, Math.max(EDGE, screenW - EDGE - w));
  return !(left + w <= hole.x || left >= hole.x + hole.w);
}

/**
 * The black above the content row — the cutout's own bottom, or nothing.
 *
 * ⚠️ THIS IS WHAT KEEPS THE CAMERA COVERING NOTHING ON A NOTCH PHONE. §5.5
 * centres the row in a 44pt visor, which is right where there is no cutout —
 * but a real notch is 209pt wide, centred and 30pt tall, and `visorCap(390)`
 * is 210, also centred. A row centred in 44pt then sits at roughly 11 → 33,
 * behind the bottom two thirds of the physical notch. The simulator draws no
 * notch, so it looked correct and was not.
 *
 * Where the cutout intrudes, the row goes below it. Where it does not — no
 * cutout at all, which is most devices — the band is 0 and §5.5's centred
 * 44pt visor is exactly what is drawn.
 */
export function visorBand(hole: Cutout, screenW: number): number {
  return cutoutIntrudes(hole, screenW) ? hole.y + hole.h : 0;
}

/**
 * ⚠️ `insets.top` IS NOT IN THIS — §5.5. The status bar is cleared
 * HORIZONTALLY by `visorCap`; only the cutout is cleared vertically, and only
 * when it is actually in the way.
 */
export function visorHeight(hole: Cutout, screenW: number): number {
  return Math.max(visorBand(hole, screenW) + VISOR_ROW, VISOR_MIN);
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
}): Layout {
  const { hole, screenW, measured: m } = input;
  const shape = shapeFor(hole.kind);
  const sealed = sealedBox(hole, screenW);
  const capW = Math.min(CAP, screenW - EDGE * 2);
  const natural = Math.min(naturalWidth(m, hole), capW);

  /*
    ⚠️ CENTRED WHERE THERE IS NOTHING IN THE WAY, BELOW THE CUTOUT WHERE THERE
    IS — and which of those it is comes from measuring this phone, not from
    its kind. With no cutout the band is 0 and the row centres in 44pt, which
    is §5.5 exactly. On a notch it starts at the notch's own bottom, because
    a row centred in 44pt would sit behind two thirds of it.
  */
  const band = shape === 'visor' ? visorBand(hole, screenW) : 0;
  const headTop = band;
  const headH = sealed.h - band;

  const openBox = (w: number, rung: Rung, lines: number): Box => ({
    x: placeX(w, hole, screenW),
    y: sealed.y,
    w,
    h: rung >= 3 ? droppedHeight(sealed.h, m, lines) : sealed.h,
    /*
      ⚠️ SHAPE FIRST, THEN RUNG — §5.3. Asking the rung first gave a dropped
      card a radius of 30, which makes it ROUNDER as it grows. `wrap` and
      A `wrap` is a pill, so 999 → 30 is the pill becoming a panel, which is
      the point.

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
    A visor has no lens in its row, so the ladder is only ever about whether
    the sentence fits — and it is capped short of the clock and the battery,
    which is why the dropped form is common there too.
  */
  if (hole.kind !== 'floating') {
    const widest = Math.min(capW, visorCap(screenW));
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
