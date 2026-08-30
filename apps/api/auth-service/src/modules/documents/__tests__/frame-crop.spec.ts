import { frameToImageCrop, rectToPixels, clampRect, isUsefulCrop } from '@hbcfield/shared';

/**
 * The frame somebody aimed with, as a rectangle of the photograph.
 *
 * Getting this wrong is invisible: the picture still looks like a picture, it
 * is just of the wrong thing. So the arithmetic is asserted directly, against
 * the case that actually occurs — a 4:3 sensor shown full-screen on a tall
 * phone, where the preview is a centre crop and a frame at 88% of the screen
 * width is NOT 88% of the image width.
 */

// A phone: 390 x 844 points. A photo: 3024 x 4032 (4:3, portrait).
const SCREEN = { width: 390, height: 844 };
const IMAGE = { width: 3024, height: 4032 };

describe('frameToImageCrop', () => {
  it('maps a centred frame to a centred rectangle', () => {
    const frame = { left: 95, top: 322, width: 200, height: 200 };
    const crop = frameToImageCrop({ frame, screen: SCREEN, image: IMAGE, padding: 0 });

    // Centred on screen means centred in the image, whatever the aspect ratios.
    expect(crop.left + crop.width / 2).toBeCloseTo(0.5, 2);
    expect(crop.top + crop.height / 2).toBeCloseTo(0.5, 2);
  });

  it('does NOT treat the screen fraction as the image fraction', () => {
    /*
      The mistake this function exists to prevent. The preview is a cover fit:
      a 4:3 photo on a 19.5:9 screen has its sides cut off, so a frame filling
      88% of the screen width covers a much smaller share of the photograph. A
      naive implementation would crop far too wide and include the table.
    */
    const frame = { left: 0.06 * SCREEN.width, top: 300, width: 0.88 * SCREEN.width, height: 220 };
    const crop = frameToImageCrop({ frame, screen: SCREEN, image: IMAGE, padding: 0 });

    expect(crop.width).toBeLessThan(0.88);
    // The visible width is screen.width / scale, and on a tall screen the scale
    // is set by the height — so a frame across 88% of the screen covers about
    // 54% of the sensor's width, not 88%.
    expect(crop.width).toBeCloseTo(0.542, 2);
  });

  it('pads outward, because a crop tight to the guide clips the document', () => {
    // Somebody aligns by eye. A clipped machine-readable zone reads as NO zone,
    // whereas a few extra millimetres of table cost nothing.
    const frame = { left: 100, top: 300, width: 190, height: 120 };
    const tight = frameToImageCrop({ frame, screen: SCREEN, image: IMAGE, padding: 0 });
    const padded = frameToImageCrop({ frame, screen: SCREEN, image: IMAGE, padding: 0.05 });

    expect(padded.width).toBeGreaterThan(tight.width);
    expect(padded.left).toBeLessThan(tight.left);
  });

  it('never returns a rectangle outside the picture', () => {
    // The padding routinely pushes a frame past the edge on a phone where the
    // guide already reaches most of the width, and an out-of-bounds extract is
    // an error rather than a smaller crop.
    const frame = { left: 0, top: 0, width: SCREEN.width, height: SCREEN.height };
    const crop = frameToImageCrop({ frame, screen: SCREEN, image: IMAGE, padding: 0.2 });

    expect(crop.left).toBeGreaterThanOrEqual(0);
    expect(crop.top).toBeGreaterThanOrEqual(0);
    expect(crop.left + crop.width).toBeLessThanOrEqual(1);
    expect(crop.top + crop.height).toBeLessThanOrEqual(1);
  });

  it('falls back to the whole picture rather than dividing by zero', () => {
    // Dimensions arrive from a native module and are occasionally absent.
    const whole = { left: 0, top: 0, width: 1, height: 1 };
    expect(frameToImageCrop({
      frame: { left: 0, top: 0, width: 10, height: 10 },
      screen: { width: 0, height: 0 },
      image: IMAGE,
    })).toEqual(whole);
  });
});

describe('rectToPixels', () => {
  it('rounds OUTWARD', () => {
    /*
      A crop rounded inward can shave the last column off a line of a
      machine-readable zone, and one missing character fails the check digit for
      the whole document — which the member then sees as "photograph it again".
    */
    const px = rectToPixels({ left: 0.1001, top: 0.2001, width: 0.5001, height: 0.3001 }, IMAGE);
    expect(px.width).toBeGreaterThanOrEqual(Math.round(0.5 * IMAGE.width));
    expect(px.height).toBeGreaterThanOrEqual(Math.round(0.3 * IMAGE.height));
  });

  it('never runs past the edge of the image', () => {
    const px = rectToPixels({ left: 0.9, top: 0.9, width: 0.5, height: 0.5 }, IMAGE);
    expect(px.left + px.width).toBeLessThanOrEqual(IMAGE.width);
    expect(px.top + px.height).toBeLessThanOrEqual(IMAGE.height);
  });
});

describe('isUsefulCrop', () => {
  it('rejects a crop that is the whole picture', () => {
    // Nothing gained, and cropping costs a decode and an encode.
    expect(isUsefulCrop({ left: 0, top: 0, width: 1, height: 1 })).toBe(false);
  });

  it('rejects a crop too small to be a document', () => {
    expect(isUsefulCrop({ left: 0.4, top: 0.4, width: 0.05, height: 0.02 })).toBe(false);
  });

  it('accepts an ordinary card-shaped crop', () => {
    expect(isUsefulCrop({ left: 0.2, top: 0.35, width: 0.6, height: 0.25 })).toBe(true);
  });
});
