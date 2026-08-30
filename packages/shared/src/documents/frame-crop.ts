/**
 * Turning the frame somebody aimed with into a rectangle of the photograph.
 *
 * The scanner draws a frame and the camera captures the whole sensor, so what
 * gets filed is a document somewhere in the middle of a table — the frame was
 * only ever a suggestion to the person holding the phone. Two consequences,
 * both bad: a reviewer opens a picture of a kitchen worktop, and the OCR, which
 * crops the lower part of the IMAGE looking for a machine-readable zone, crops
 * the lower part of the worktop.
 *
 * The mapping is not a simple scale because the preview is a COVER fit: the
 * photograph is usually 4:3 and the screen is not, so what a person sees is a
 * centre crop of what the sensor recorded. A frame at 88% of the screen width
 * is not 88% of the image width.
 *
 * Pure, and here rather than in the component, because getting it wrong is
 * invisible — the picture still looks like a picture, it is just of the wrong
 * thing.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The frame, as a fraction of the photograph.
 *
 * `frame` and `screen` are in the same units (points); `image` is the
 * photograph's own pixel dimensions. The result is 0–1 fractions, so the server
 * can apply it to whatever the real pixel size turns out to be.
 *
 * `padding` widens the rectangle on every side. It defaults to a little more
 * than nothing because a crop tight to the guide clips the edge of a document
 * somebody aligned by eye, and a clipped machine-readable zone reads as no zone
 * at all — whereas a few extra millimetres of table cost nothing.
 */
export function frameToImageCrop(input: {
  frame: Rect;
  screen: { width: number; height: number };
  image: { width: number; height: number };
  padding?: number;
}): Rect {
  const { frame, screen, image } = input;
  const padding = input.padding ?? 0.04;

  if (!screen.width || !screen.height || !image.width || !image.height) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }

  /*
    The preview covers the screen, so the sensor image is scaled up until BOTH
    dimensions reach it and the overflow is cut off equally on each side. That
    scale, and the offsets it produces, are the whole of the mapping.
  */
  const scale = Math.max(screen.width / image.width, screen.height / image.height);
  const visibleWidth = screen.width / scale;
  const visibleHeight = screen.height / scale;
  const offsetX = (image.width - visibleWidth) / 2;
  const offsetY = (image.height - visibleHeight) / 2;

  const left = (offsetX + frame.left / scale) / image.width;
  const top = (offsetY + frame.top / scale) / image.height;
  const width = frame.width / scale / image.width;
  const height = frame.height / scale / image.height;

  return clampRect({
    left: left - padding,
    top: top - padding,
    width: width + padding * 2,
    height: height + padding * 2,
  });
}

/**
 * Keep a rectangle inside the picture.
 *
 * The padding above routinely pushes a frame past the edge on a phone where the
 * guide already reaches 88% of the width, and an out-of-bounds extract is an
 * error rather than a smaller crop.
 */
export function clampRect(r: Rect): Rect {
  const left = Math.min(Math.max(r.left, 0), 1);
  const top = Math.min(Math.max(r.top, 0), 1);
  return {
    left,
    top,
    width: Math.min(Math.max(r.width, 0), 1 - left),
    height: Math.min(Math.max(r.height, 0), 1 - top),
  };
}

/**
 * The rectangle in real pixels, for a cropper that works in them.
 *
 * Rounded outward — a crop rounded inward can shave the last column off a line
 * of a machine-readable zone, and one missing character fails the checksum for
 * the whole document.
 */
export function rectToPixels(r: Rect, image: { width: number; height: number }): Rect {
  const left = Math.max(0, Math.floor(r.left * image.width));
  const top = Math.max(0, Math.floor(r.top * image.height));
  return {
    left,
    top,
    width: Math.min(image.width - left, Math.ceil(r.width * image.width)),
    height: Math.min(image.height - top, Math.ceil(r.height * image.height)),
  };
}

/** Too small to be a document, or so large it is not a crop at all. */
export function isUsefulCrop(r: Rect): boolean {
  return r.width > 0.15 && r.height > 0.05 && (r.width < 0.995 || r.height < 0.995);
}
