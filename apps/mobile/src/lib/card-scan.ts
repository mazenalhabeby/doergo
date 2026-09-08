import { requireOptionalNativeModule } from 'expo-modules-core';
import { parseBusinessCard, toCardLines, type ParsedCard } from '@hbcfield/shared/client';

/**
 * A photo of a business card → the fields of a client.
 *
 * Reading pixels is a native module's job; deciding which line is the name is
 * ours, in `parseBusinessCard`, which is pure and tested without a device.
 * Nothing calls out — the model ships inside the app, so a scan works in a
 * basement and costs nothing per card.
 */

type Ocr = {
  recognizeText: (uri: string) => Promise<{ blocks: unknown[] }>;
  isSupported: () => boolean;
};

/*
  ⚠️ BOUND WITH THE *OPTIONAL* API, AND THAT IS THE WHOLE POINT.

  The obvious `import { recognizeText } from 'expo-mlkit-ocr'` cannot be used
  here. That package binds at module scope with `requireNativeModule`, which
  THROWS when the native side is absent — and the native side is absent in
  every binary built before the scanner existed.

  Two attempts got this wrong before this one:

    1. A plain top-level import. The throw happened at import, before any
       capability check could run, so the customers screen died outright.
       ⚠️ Over the air that would have crashed the screen for every existing
       user, for a feature none of them can use yet.
    2. A `require()` inside a try/catch. The catch worked, but the throw is
       still REPORTED on its way out — a red error on every render of the
       customers screen, which is not "degraded", it is broken-looking.

  `requireOptionalNativeModule` answers `null` instead of throwing. No error is
  raised, so none is reported, and a build without the reader simply does not
  offer scanning.
*/
const ocr = requireOptionalNativeModule<Ocr>('ExpoMlkitOcr');

/**
 * Can this BUILD scan at all?
 *
 * Asked before the option is offered rather than discovered when somebody taps
 * it: an older build hides "Scan a business card" and still adds clients by
 * hand.
 */
/*
  Asked once, not per render.

  `isSupported()` crosses the native bridge, and this is called from the render
  path of a list screen. The answer cannot change while the app is running —
  a native module does not appear mid-session — so caching it is not an
  optimisation with a caveat, it is the correct lifetime.
*/
let supported: boolean | null = null;

export function canScanCards(): boolean {
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

export async function scanBusinessCard(uri: string, imageHeight: number): Promise<ParsedCard> {
  if (!ocr) throw new Error('This build cannot scan cards');
  const result = await ocr.recognizeText(uri);
  return parseBusinessCard(toCardLines(result.blocks as never, imageHeight));
}

export type { ParsedCard };
