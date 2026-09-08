import { recognizeText, isSupported } from 'expo-mlkit-ocr';
import { parseBusinessCard, toCardLines, type ParsedCard } from '@hbcfield/shared/client';

/**
 * A photo of a business card → the fields of a client.
 *
 * Two steps that stay apart on purpose. Reading pixels is the native module's
 * job; deciding which line is the name is ours, in `parseBusinessCard`, which
 * is pure and tested without a device. Keeping them separate means the reader
 * can be swapped — Apple Vision, or a paid service later — without touching a
 * single rule.
 *
 * Nothing here calls out. The model ships inside the app, so a scan works in a
 * basement and costs nothing per card.
 */

/**
 * Can this BUILD scan at all?
 *
 * ⚠️ The reader is a native module, so it exists only in a binary built after
 * it was added. An over-the-air update carries this JavaScript to phones whose
 * binary predates it, and on those `recognizeText` is simply not there.
 *
 * Asked before the option is offered rather than discovered when somebody taps
 * it: an old build hides "Scan a business card" and still adds clients by hand,
 * which is degraded rather than broken. The same rule the map-app picker
 * follows.
 */
export function canScanCards(): boolean {
  try {
    return typeof isSupported === 'function' ? isSupported() : false;
  } catch {
    return false;
  }
}

export async function scanBusinessCard(uri: string, imageHeight: number): Promise<ParsedCard> {
  const result = await recognizeText(uri);
  return parseBusinessCard(toCardLines(result.blocks as never, imageHeight));
}

export type { ParsedCard };
