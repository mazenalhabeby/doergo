import { parseBusinessCard, toCardLines, type ParsedCard, type CropRect } from '@hbcfield/shared/client';
import { canReadText, readBlocks } from './ocr';

/**
 * A photo of a business card → the fields of a client.
 *
 * Reading pixels is `./ocr`'s job; deciding which line is the name is ours, in
 * `parseBusinessCard`, which is pure and tested without a device. Nothing calls
 * out — the model ships inside the app, so a scan works in a basement and costs
 * nothing per card.
 *
 * ⚠️ The native binding, the capability cache and the reasons behind both used
 * to live HERE, and again in `receipt-scan.ts`, word for word. They are in
 * `./ocr` now — one copy of a rule about native code that, got wrong, crashes
 * a screen for every existing user over the air.
 */

/** Can this BUILD scan at all? Asked before the option is offered. */
export const canScanCards = canReadText;

/**
 * @param crop  The card frame the person aimed, in fractions of the image.
 *              Everything outside it is discarded before the rules run — see
 *              `toCardLines` for why that is correctness, not tidiness.
 */
export async function scanBusinessCard(
  uri: string,
  image: { width: number; height: number },
  crop?: CropRect,
): Promise<ParsedCard> {
  // Blocks, not lines: where a line sits on the card and how big its type is
  // are the two signals the card parser rests on, and a flat list loses both.
  const blocks = await readBlocks(uri);
  return parseBusinessCard(toCardLines(blocks as never, image.height, crop, image.width));
}

export type { ParsedCard };
