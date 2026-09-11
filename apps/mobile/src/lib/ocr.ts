import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The one text reader on the phone.
 *
 * Pixels are a native module's job. What the words MEAN — which line is the
 * name, which figure is the total, which date is the expiry — is ours, in
 * `packages/shared`, pure and tested without a device. This file is the seam
 * between those two, and it is the only place in the app that touches the
 * native reader.
 *
 * ⚠️ IT USED TO BE THREE PLACES. `card-scan.ts` and `receipt-scan.ts` each held
 * their own copy of the binding, the capability cache and the `canScanX()`
 * function — identical down to the comments — and the document flow had no
 * reader at all, so it uploaded a photograph and asked the SERVER to read it
 * with tesseract, while a better reader sat unused in the member's pocket.
 *
 * Three copies of a rule about native code is three chances to get the one
 * thing wrong that crashes an app over the air. See `binding`, below.
 */

type NativeOcr = {
  recognizeText: (uri: string) => Promise<{ blocks: unknown[] }>;
  isSupported: () => boolean;
};

/** A line as the reader reports it, with its box in image pixels. */
export interface OcrLine {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface OcrBlock {
  lines: OcrLine[];
}

/*
  ⚠️ BOUND WITH THE *OPTIONAL* API, AND THAT IS THE WHOLE POINT.

  The obvious `import { recognizeText } from 'expo-mlkit-ocr'` cannot be used.
  That package binds at module scope with `requireNativeModule`, which THROWS
  when the native side is absent — and the native side is absent in every binary
  built before the reader shipped.

  Two attempts got this wrong before this one:

    1. A plain top-level import. The throw happened at import, before any
       capability check could run, so the screen died outright. Over the air
       that crashes the screen for every existing user, in service of a feature
       none of them can use yet.
    2. A `require()` inside a try/catch. The catch worked, but React Native
       still REPORTS the throw on its way out — a red error on every render,
       which is not "degraded", it is broken-looking.

  `requireOptionalNativeModule` answers `null` instead of throwing. No error is
  raised, so none is reported, and a build without the reader simply does not
  offer scanning.
*/
const binding = requireOptionalNativeModule<NativeOcr>('ExpoMlkitOcr');

/*
  Asked once, not per render.

  `isSupported()` crosses the native bridge and this is called from the render
  path of list screens. The answer cannot change while the app is running — a
  native module does not appear mid-session — so caching it is the correct
  lifetime, not an optimisation with a caveat.
*/
let supported: boolean | null = null;

/**
 * Can this BUILD read text from a picture at all?
 *
 * Asked before the option is offered rather than discovered when somebody taps
 * it: an older build hides "Scan" and still lets everything be typed in.
 */
export function canReadText(): boolean {
  if (supported !== null) return supported;
  if (!binding) {
    supported = false;
    return supported;
  }
  try {
    supported = binding.isSupported();
  } catch {
    // Present but unusable — an old Android without the ML Kit dependency.
    supported = false;
  }
  return supported;
}

/**
 * The raw blocks, for a caller that needs the geometry.
 *
 * The business card is the one that does: where a line sits on the card and how
 * big its type is are the two signals the whole parser rests on.
 */
export async function readBlocks(uri: string): Promise<OcrBlock[]> {
  if (!binding) throw new Error('This build cannot read text from images');
  const result = await binding.recognizeText(uri);
  return result.blocks as OcrBlock[];
}

/**
 * The page as lines, top to bottom, as printed.
 *
 * ⚠️ Order is not cosmetic. The vendor is at the TOP of a slip and the total is
 * near the BOTTOM; a licence prints its dates in numbered fields down the card.
 * ML Kit groups by BLOCK rather than returning lines in reading order, so an
 * unsorted list reads a fuel station's address as its total's neighbour and
 * loses the one positional signal there is.
 *
 * No crop, unlike the card reader: a receipt is a long strip of any proportion
 * and a certificate is a whole page, and neither person can be asked to fit it
 * in a rectangle. The rules earn their keep on the words instead, which is why
 * those parsers lean on LABELS rather than on which figure is biggest.
 */
export async function readLines(uri: string): Promise<string[]> {
  return toLines(await readBlocks(uri));
}

/** Exported for the parsers that already hold blocks. */
export function toLines(blocks: OcrBlock[]): string[] {
  return blocks
    .flatMap((b) => b.lines ?? [])
    .filter((l) => !!l?.text?.trim())
    .sort((a, b) => (a.boundingBox?.y ?? 0) - (b.boundingBox?.y ?? 0))
    .map((l) => l.text);
}
