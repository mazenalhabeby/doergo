import { loadImageManipulator } from '../offline/native';

/**
 * ONE image downscaler — the LONG edge is bounded, whichever way the photo was
 * taken.
 *
 * ⚠️ Bounding the WIDTH is not bounding the image. The multi-page document
 * upload used to resize every sheet to `width: 2200`, so a portrait page
 * (3024×4032 from an iPhone) came out 2200×2933 — past the server's bound,
 * spending the member's data on rows the server throws away — and a photo
 * already smaller than the bound was blown UP to it. Here the long edge is
 * compared first, and nothing is ever enlarged.
 *
 * ⚠️ Through the LOADER, never a top-level import: `expo-image-manipulator`
 * binds its native module on evaluation (`native-imports.spec.ts`). On a build
 * without it this returns null and the caller keeps the image as it came.
 */

export interface DownscaleOptions {
  /** The longest the longer side may be, in pixels. */
  maxEdge: number;
  /** JPEG quality, 0–1. */
  quality: number;
}

export interface DownscaledImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * The resize that bounds the long edge, or null when the image already fits.
 * One side only, so the aspect ratio is kept by the library.
 */
export function longEdgeResize(width: number, height: number, maxEdge: number): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0) || Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/**
 * Re-encode `uri` as JPEG with its long edge at most `maxEdge`.
 *
 * Null when this build has no image manipulator. A failure inside the library
 * is thrown — the callers decide whether the original is good enough.
 */
export async function downscaleImage(uri: string, opts: DownscaleOptions): Promise<DownscaledImage | null> {
  const lib = loadImageManipulator();
  if (!lib) return null;

  let image = await lib.ImageManipulator.manipulate(uri).renderAsync();
  // Measured from the decoded image, never from what a caller believed the photo to be.
  const resize = longEdgeResize(image.width, image.height, opts.maxEdge);
  if (resize) image = await lib.ImageManipulator.manipulate(image).resize(resize).renderAsync();

  const saved = await image.saveAsync({ compress: opts.quality, format: lib.SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
