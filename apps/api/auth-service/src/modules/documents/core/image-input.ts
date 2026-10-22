/**
 * Opening an image somebody else chose.
 *
 * Every image in this module arrives from a member's phone or file picker, and
 * `sharp(bytes)` will decode whatever the header claims. The size that matters is
 * not the file — a 20 MB upload passes the size check — but the DIMENSIONS, which
 * decide how much memory the decode allocates before any of our code runs. A few
 * hundred kilobytes of cleverly-authored file can ask for gigabytes of pixels.
 *
 * sharp's own default cap is 268 megapixels, which is far past anything a camera
 * produces and past what this container can hold: at 3 bytes a pixel that is
 * 800 MB of raw image inside a 512 MB service.
 *
 * The bound below is set from measurement rather than taste. One MRZ scan of a
 * 12-megapixel photo peaks at ~220 MB in production, most of it the OCR engine
 * rather than the picture. 60 MP is five times a typical phone photo, above any
 * realistic camera output, and decodes to ~180 MB — which keeps the worst case
 * inside the container with the engine loaded alongside it.
 *
 * One helper rather than an option at each call site: there are ten of them
 * across this module, and the one that matters is always the one somebody forgets
 * to pass it to.
 */

/** 60 megapixels. Five times a phone photo; a fifth of sharp's own default. */
export const MAX_INPUT_PIXELS = 60_000_000;

type Sharp = Awaited<ReturnType<typeof loadSharp>>;

async function loadSharp() {
  return (await import('sharp')).default;
}

/**
 * A sharp pipeline over bytes we did not produce, with the decode bounded.
 *
 * Throws for an image beyond the cap, which the callers already treat as "this
 * document could not be read" — the honest outcome, and the same one they give
 * for a corrupt file.
 */
export async function openUntrustedImage(bytes: Buffer): Promise<ReturnType<Sharp>> {
  const sharp = await loadSharp();
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
}
