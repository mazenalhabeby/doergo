/** OCR output (any engine) → CardLines, upright and cropped. */
import type { CardLine } from './types';

/** A line as an OCR engine reports it: text plus a box in IMAGE PIXELS. */
export interface OcrLine {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/** A region of the image, in fractions of it — what `frameToImageCrop` returns. */
export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Pixels → fractions of the CARD.
 *
 * ⚠️ Getting this wrong does not throw. It quietly makes every line the same
 * "size", which removes the strongest signal the rules have and turns name
 * detection into a coin flip. It lives here, next to the rules that depend on
 * it, rather than in the screen that happens to call the camera.
 *
 * ⚠️ `crop` is not an optimisation. The photograph is the whole frame — a desk,
 * a poster, whatever is behind the card — and every word of that reaches the
 * reader. Two things go wrong without it: background text competes to be the
 * company, and heights are measured against the PHOTO rather than the card, so
 * "the largest line" stops meaning "the largest line on the card". Keeping only
 * what was inside the frame the person aimed, and re-measuring against that
 * frame, fixes both — and costs nothing, because the reader has already done
 * the work.
 *
 * ⚠️ It reports `x` and `width` as well, and that is the whole of what makes
 * columns possible. They used to be computed here and thrown away one line
 * later, so a card with the firm down one side and the person down the other
 * arrived as interleaved lines in an order nothing could reason about.
 *
 * Also sorts into reading order: ML Kit groups by block, and blocks do not
 * arrive top-to-bottom.
 */
/**
 * Is the writing on its side?
 *
 * A line of horizontal text makes a wide, short box; give the card a quarter
 * turn and every box becomes tall and narrow, because a bounding box stays
 * axis-aligned however the text runs. So the SHAPE of the boxes, taken
 * together, tells us which way the card is lying — no engine has to report an
 * angle, which matters because the reader we bind to reports only a rectangle.
 *
 * ⚠️ Measured in PIXELS, never in the normalised fractions used below. Dividing
 * width by the image width and height by the image height stretches every box
 * by the image's own aspect, so on a 4:3 photograph a perfectly square box
 * comes out "tall" and a page of ordinary text can read as rotated.
 *
 * ⚠️ Decided over the card as a whole, never per line. "GmbH" set small is
 * nearly square, and a single stacked word — a logo, a vertical rule — must not
 * be able to turn the rest of the card on its side. Lines with no clear shape
 * abstain rather than vote.
 */
function readsSideways(lines: OcrLine[]): boolean {
  const decisive = lines.filter((l) => {
    if (l.text.trim().length < 3) return false;
    const { width, height } = l.boundingBox;
    if (width <= 0 || height <= 0) return false;
    return width > height * 1.5 || height > width * 1.5;
  });
  // Two lines is the least that can be a majority of anything.
  if (decisive.length < 2) return false;
  const tall = decisive.filter((l) => l.boundingBox.height > l.boundingBox.width).length;
  return tall * 2 > decisive.length;
}

export function toCardLines(
  blocks: { lines: OcrLine[] }[],
  imageHeight: number,
  crop?: CropRect,
  imageWidth?: number,
): CardLine[] {
  const h = imageHeight > 0 ? imageHeight : 1;
  const w = imageWidth && imageWidth > 0 ? imageWidth : 1;

  const raw = blocks.flatMap((b) => b.lines);

  /*
    A portrait-format card laid in a landscape frame is not an edge case — it
    is a whole style of card, and the person holding the phone has no way to
    tell us. Reading the geometry means the same rules work either way up.
  */
  const sideways = readsSideways(raw);

  /*
    Which way the rules should look.

    `y` in a CardLine means "how far down the card" and `height` means "how big
    the type is"; `x` and `width` mean "how far ACROSS" and "how wide", which is
    what the column clusterer reads. When the card is on its side those live on
    the other axis, so the two pairs are simply swapped. Everything downstream
    is unchanged, and cannot tell the difference.
  */
  const along = (l: { x: number; y: number }) => (sideways ? l.x : l.y);
  const size = (l: { width: number; height: number }) => (sideways ? l.width : l.height);
  const across = (l: { x: number; y: number }) => (sideways ? l.y : l.x);
  const breadth = (l: { width: number; height: number }) => (sideways ? l.height : l.width);

  const all = raw.map((l) => ({
    text: l.text,
    // Fractions of the whole image first; the crop is expressed the same way.
    x: l.boundingBox.x / w,
    y: l.boundingBox.y / h,
    width: l.boundingBox.width / w,
    height: l.boundingBox.height / h,
  }));

  if (!crop || crop.width <= 0 || crop.height <= 0) {
    return all
      .map((l) => ({ text: l.text, y: along(l), height: size(l), x: across(l), width: breadth(l) }))
      .sort((a, b) => a.y - b.y);
  }

  const right = crop.left + crop.width;
  const bottom = crop.top + crop.height;
  // The card's own extent along whichever axis the writing runs down, and
  // across whichever axis the columns run.
  const start = sideways ? crop.left : crop.top;
  const span = sideways ? crop.width : crop.height;
  const crossStart = sideways ? crop.top : crop.left;
  const crossSpan = sideways ? crop.height : crop.width;

  return all
    // A line belongs to the card if its CENTRE is inside the frame. Judging by
    // the whole box would drop anything the frame clips by a pixel, which is
    // most of a card held to fill it.
    .filter((l) => {
      const cx = l.x + l.width / 2;
      const cy = l.y + l.height / 2;
      return cx >= crop.left && cx <= right && cy >= crop.top && cy <= bottom;
    })
    // Re-measured against the CARD, so height means what the rules assume.
    .map((l) => ({
      text: l.text,
      y: (along(l) - start) / span,
      height: size(l) / span,
      x: (across(l) - crossStart) / crossSpan,
      width: breadth(l) / crossSpan,
    }))
    .sort((a, b) => a.y - b.y);
}
