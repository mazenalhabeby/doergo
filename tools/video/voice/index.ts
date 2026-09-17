/**
 * Which voice the pipeline speaks with, chosen by VIDEO_TTS.
 *
 * ⚠️ NO KEY LIVES IN THIS REPO. `elevenlabs` reads `ELEVENLABS_API_KEY` from the
 * environment (`.env` is gitignored) and reports itself unavailable without
 * one, so a machine with no key falls back to `say` rather than failing a
 * render that has already spent two minutes driving a browser.
 *
 * ⚠️ `say` stays the DEFAULT on purpose: characters are billed, so iterate on
 * wording for free and switch with `VIDEO_TTS=elevenlabs` for the take you mean
 * to publish.
 */

import type { VoiceAdapter } from './types.ts';
import { sayAdapter } from './say.ts';
import { elevenLabsAdapter } from './elevenlabs.ts';

export type { VoiceAdapter, SynthesisRequest, SynthesisResult } from './types.ts';

const ADAPTERS: Record<string, VoiceAdapter> = {
  say: sayAdapter,
  elevenlabs: elevenLabsAdapter,

  // Another provider is one more file: export a VoiceAdapter whose
  // isAvailable() is false without its key, and register it here. Nothing else
  // in the pipeline changes — assembly reads durations off the produced files,
  // so a slower or faster voice re-paces the capture on the next run.
};

export function selectVoiceAdapter(): VoiceAdapter {
  const requested = process.env.VIDEO_TTS ?? 'say';
  const adapter = ADAPTERS[requested];
  if (!adapter) {
    throw new Error(
      `Unknown VIDEO_TTS="${requested}". Available: ${Object.keys(ADAPTERS).join(', ')}`,
    );
  }
  return adapter;
}
