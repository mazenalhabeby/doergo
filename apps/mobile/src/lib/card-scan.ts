import {
  parseBusinessCard, toCardLines, mergeCardPasses, cardReadQuality,
  type ParsedCard, type CropRect, type CardLine, type CardReadQuality,
} from '@hbcfield/shared/client';
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
 *
 * ⚠️ A CARD IS LOOKED AT MORE THAN ONCE. The failure this answers is not
 * parsing: a real card came back with no email at all because a shadow lay
 * across the half it was printed on, and the recogniser never produced that
 * line. No rule recovers text that was never read — but a hand holding a phone
 * moves, the autofocus settles and the exposure adapts, so consecutive frames
 * of a STILL card are not the same picture. `mergeCardPasses` unions them.
 */

/** Can this BUILD scan at all? Asked before the option is offered. */
export const canScanCards = canReadText;

/**
 * How many looks to take, and how long to wait for them.
 *
 * ⚠️ THE FRAMES MUST DIFFER, which is why there is a gap at all: three shots
 * off one settling sensor with no pause between them are three copies of the
 * same mistake, and the merge has nothing to recover. ~280ms is long enough for
 * the autofocus to move and short enough that nobody counts it.
 *
 * ⚠️ THE BUDGET IS A CEILING ON THE EXTRA LOOKS, NOT ON THE SCAN. The first
 * frame is always awaited in full — it is the whole answer if the others fail.
 * After that the clock decides: a slow phone takes two passes instead of three
 * and the member never learns there was a third. A scan that feels broken costs
 * more than the line a third frame might have recovered.
 */
export const CARD_FRAMES = 3;
export const CARD_FRAME_GAP_MS = 250;
export const CARD_FRAME_BUDGET_MS = 2000;

/**
 * Is another look worth taking?
 *
 * Pure, and exported, because "how long the member waits" is a product decision
 * that should be arguable in a test rather than buried in a capture loop.
 *
 * @param taken     How many frames have already been read.
 * @param elapsedMs Since the shutter was pressed — INCLUDING the first frame,
 *                  which is what makes a slow phone stop at two.
 */
export function wantsAnotherFrame(taken: number, elapsedMs: number): boolean {
  return taken > 0 && taken < CARD_FRAMES && elapsedMs < CARD_FRAME_BUDGET_MS;
}

/**
 * How long to wait before the NEXT look, given how long the last one took.
 *
 * ⚠️ THE GAP EXISTS TO LET THE FRAME CHANGE, not to pass time. A frame that
 * already took a quarter of a second has had its quarter second: the sensor
 * went on metering and focusing while the recogniser worked, so the next shot
 * is a genuinely different picture and a further pause buys nothing but a
 * slower scan on the phone least able to afford one.
 *
 * Sleeping a flat 250ms×2 regardless is how "look twice" turns into "the
 * scanner got slower", which costs more than the line a third frame recovers.
 */
export function frameGapAfter(frameMs: number): number {
  return Math.max(0, CARD_FRAME_GAP_MS - frameMs);
}

/**
 * ONE look at the card: pixels to placed lines, no rules yet.
 *
 * @param crop  The card frame the person aimed, in fractions of the image.
 *              Everything outside it is discarded before the rules run — see
 *              `toCardLines` for why that is correctness, not tidiness.
 */
export async function readCardLines(
  uri: string,
  image: { width: number; height: number },
  crop?: CropRect,
): Promise<CardLine[]> {
  // Blocks, not lines: where a line sits on the card and how big its type is
  // are the two signals the card parser rests on, and a flat list loses both.
  const blocks = await readBlocks(uri);
  return toCardLines(blocks as never, image.height, crop, image.width);
}

export interface CardScan {
  card: ParsedCard;
  /** Was that a good look? The screen says so out loud when it was not. */
  quality: CardReadQuality;
}

/**
 * Several looks, merged, then parsed ONCE.
 *
 * ⚠️ Parsed once on the merged result, never per frame. The rules are the
 * expensive half and their answer for one frame is worth nothing next to their
 * answer for the union — running them three times would triple the wait to
 * produce two results that are thrown away.
 *
 * ⚠️ An empty pass is not an error. A frame where the card was out of focus
 * contributes nothing; `mergeCardPasses` skips it, and a scan where only the
 * first frame produced anything is exactly as good as a single-frame scan was.
 */
export function parseCardPasses(passes: readonly (readonly CardLine[])[]): CardScan {
  const merged = mergeCardPasses(passes);
  return { card: parseBusinessCard(merged), quality: cardReadQuality(merged) };
}

export type { ParsedCard, CardLine, CardReadQuality };
