import { requireOptionalNativeModule } from 'expo-modules-core';
import { parseReceipt, parseContract, type ParsedReceipt, type ParsedContract } from '@hbcfield/shared/client';

/**
 * A photograph of a receipt → the amount, the date and who was paid.
 *
 * The same split as the business-card reader: pixels are a native module's job,
 * and deciding which figure on the slip is the total is ours, in
 * `parseReceipt`, which is pure and tested without a device. Nothing calls out
 * — the model ships inside the app, so a fuel receipt reads at a motorway pump
 * with one bar of signal and costs nothing per scan.
 */

type Ocr = {
  recognizeText: (uri: string) => Promise<{ blocks: unknown[] }>;
  isSupported: () => boolean;
};

/*
  ⚠️ BOUND WITH THE *OPTIONAL* API, exactly as the card reader is.

  `expo-mlkit-ocr` binds at module scope with `requireNativeModule`, which
  THROWS when the native side is absent — and it is absent in every binary
  built before this shipped. A plain import kills the screen at import time,
  before any capability check can run; a require() in a try/catch still REPORTS
  the throw on its way out, which is a red error on every render.

  `requireOptionalNativeModule` answers null instead. A build without the
  reader simply offers typing the amount in, which is the whole feature minus
  the convenience.
*/
const ocr = requireOptionalNativeModule<Ocr>('ExpoMlkitOcr');

/*
  Asked once, not per render. `isSupported()` crosses the native bridge and the
  answer cannot change while the app is running — a native module does not
  appear mid-session — so caching it is the correct lifetime, not a shortcut.
*/
let supported: boolean | null = null;

/** Can this BUILD read a slip at all? Asked before the camera is offered. */
export function canScanReceipts(): boolean {
  if (supported !== null) return supported;
  if (!ocr) { supported = false; return supported; }
  try {
    supported = ocr.isSupported();
  } catch {
    // Present but unusable — an old Android without the ML Kit dependency.
    supported = false;
  }
  return supported;
}

/** A line as the reader reports it, with its box in image pixels. */
interface OcrLine {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/**
 * Top to bottom, as printed.
 *
 * ⚠️ Order is not cosmetic here. The vendor is at the TOP of a slip and the
 * total is near the BOTTOM, and ML Kit groups by block rather than returning
 * lines in reading order — so an unsorted list reads a fuel station's address
 * as its total's neighbour and loses the one positional signal there is.
 *
 * No crop, unlike the card reader: a receipt is a long strip of any proportion
 * and the person cannot be asked to fit it in a rectangle. The rules earn their
 * keep on the words instead, which is why the parser leans on LABELS rather
 * than on which figure is biggest.
 */
function toLines(blocks: { lines: OcrLine[] }[]): string[] {
  return blocks
    .flatMap((b) => b.lines ?? [])
    .filter((l) => !!l?.text?.trim())
    .sort((a, b) => (a.boundingBox?.y ?? 0) - (b.boundingBox?.y ?? 0))
    .map((l) => l.text);
}

export async function scanReceipt(uri: string): Promise<{ receipt: ParsedReceipt; lines: string[] }> {
  if (!ocr) throw new Error('This build cannot read receipts');
  const result = await ocr.recognizeText(uri);
  const lines = toLines(result.blocks as never);
  return { receipt: parseReceipt(lines), lines };
}

/**
 * A contract, read the same way and by the same reader.
 *
 * Shares `toLines` with the receipt on purpose: both are a page of printed text
 * whose reading order matters, and a second sort with its own idea of "top"
 * would eventually disagree with this one about which line the total is on.
 *
 * ⚠️ The TEXT NEVER LEAVES THE PHONE. What goes to the server is the fields
 * after a person has corrected them — a plate, a make, two dates. A rental
 * agreement carries the member's home address, their licence number and their
 * bank details, and none of that is the organization's to keep.
 */
export async function scanContract(uri: string): Promise<{ contract: ParsedContract; lines: string[] }> {
  if (!ocr) throw new Error('This build cannot read documents');
  const result = await ocr.recognizeText(uri);
  const lines = toLines(result.blocks as never);
  return { contract: parseContract(lines), lines };
}

/** Reading a contract needs exactly what reading a slip needs. */
export const canScanContracts = canScanReceipts;

export type { ParsedReceipt, ParsedContract };
