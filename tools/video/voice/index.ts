/**
 * Which voice the pipeline speaks with, chosen by VIDEO_TTS.
 *
 * ⚠️ No paid provider is wired up and no API key lives anywhere in this repo.
 * The two commented stubs below describe exactly what a future adapter has to
 * do; they are deliberately not implemented, because an adapter that reads a
 * key from the environment invites somebody to commit one.
 */

import type { VoiceAdapter } from './types.ts';
import { sayAdapter } from './say.ts';

export type { VoiceAdapter, SynthesisRequest, SynthesisResult } from './types.ts';

const ADAPTERS: Record<string, VoiceAdapter> = {
  say: sayAdapter,

  // To add ElevenLabs or OpenAI later:
  //   1. Write voice/elevenlabs.ts exporting a VoiceAdapter.
  //   2. isAvailable() returns false when its key env var is unset, so a
  //      machine without one falls back instead of failing a render at 90%.
  //   3. Register it here. Nothing else in the pipeline changes — assembly
  //      reads durations off the produced files, so a slower or faster voice
  //      re-paces the capture automatically on the next run.
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
