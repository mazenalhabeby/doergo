import { parseBusinessCard, toCardLines, type ParsedCard } from '@hbcfield/shared/client';

/**
 * A photo of a business card → the fields of a client.
 *
 * Reading pixels is a native module's job; deciding which line is the name is
 * ours, in `parseBusinessCard`, which is pure and tested without a device.
 * Nothing calls out — the model ships inside the app, so a scan works in a
 * basement and costs nothing per card.
 */

/*
  ⚠️⚠️ THE READER IS LOADED LAZILY, AND THAT IS NOT A STYLE CHOICE.

  `expo-mlkit-ocr` binds to native code at MODULE SCOPE:

      export default requireNativeModule('ExpoMlkitOcr');

  `requireNativeModule` throws immediately when the native side is absent. A
  plain top-level import therefore takes the whole screen down as soon as it is
  imported — before any capability check can run. The first version of this
  file did exactly that, and the damage was not limited to development:

    · Expo Go has no such module, so opening the app crashed it outright.
    · An over-the-air update carries this JavaScript to production phones whose
      binary predates the module. Every one of them would have crashed on the
      customers screen — a feature nobody asked for breaking a screen everybody
      uses.

  Requiring it inside a function moves that throw to the moment somebody
  actually scans, where it can be caught. Metro still bundles the module, so a
  build that HAS the native side works normally.
*/
type Ocr = {
  recognizeText: (uri: string) => Promise<{ blocks: unknown[] }>;
  isSupported: () => boolean;
};

function loadOcr(): Ocr | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-mlkit-ocr') as Ocr;
  } catch {
    // No native side in this binary. Not an error — an answer.
    return null;
  }
}

/**
 * Can this BUILD scan at all?
 *
 * Asked before the option is offered rather than discovered when somebody taps
 * it: an older build hides "Scan a business card" and still adds clients by
 * hand, which is degraded rather than broken.
 */
export function canScanCards(): boolean {
  const ocr = loadOcr();
  if (!ocr) return false;
  try {
    return ocr.isSupported();
  } catch {
    return false;
  }
}

export async function scanBusinessCard(uri: string, imageHeight: number): Promise<ParsedCard> {
  const ocr = loadOcr();
  if (!ocr) throw new Error('This build cannot scan cards');
  const result = await ocr.recognizeText(uri);
  return parseBusinessCard(toCardLines(result.blocks as never, imageHeight));
}

export type { ParsedCard };
