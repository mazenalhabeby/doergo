/**
 * macOS `say` — the default, and the reason this pipeline costs nothing.
 *
 * Quality is honestly mediocre next to a paid neural voice. That is a
 * deliberate trade: a video you can re-render for free every time the product
 * changes beats a better-sounding one nobody re-records. When a video is worth
 * publishing, swap VIDEO_TTS and re-run — the timings adjust themselves,
 * because capture paces itself to the narration rather than the other way
 * round.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SynthesisRequest, SynthesisResult, VoiceAdapter } from './types.ts';
import { probeDurationSec } from '../assemble/ffmpeg.ts';

const run = promisify(execFile);

/**
 * Samantha is the most neutral of the 18 English system voices — the character
 * ones (Bells, Bad News, Jester) are novelty synths and unusable for product
 * narration. Overridable because accents matter to some audiences: Daniel is
 * en_GB, Karen en_AU.
 */
const VOICE = process.env.VIDEO_SAY_VOICE ?? 'Samantha';

/**
 * Words per minute. The default `say` rate is ~175, which reads as hurried
 * over a screen recording where the viewer is also trying to watch a cursor.
 * 165 leaves room to breathe without dragging.
 */
const RATE = Number(process.env.VIDEO_SAY_RATE ?? 165);

export const sayAdapter: VoiceAdapter = {
  name: `say(${VOICE}@${RATE}wpm)`,

  async isAvailable() {
    if (process.platform !== 'darwin') return false;
    try {
      await run('say', ['-v', '?']);
      return true;
    } catch {
      return false;
    }
  },

  async synthesize({ text, outPath }: SynthesisRequest): Promise<SynthesisResult> {
    await fs.mkdir(path.dirname(outPath), { recursive: true });

    // `say` writes AIFF natively. Asking it for WAV works on recent macOS but
    // has silently produced headerless files in the past, so go through AIFF
    // and let ffmpeg do the conversion it is actually good at.
    const aiff = `${outPath}.aiff`;
    await run('say', ['-v', VOICE, '-r', String(RATE), '-o', aiff, '--', text]);

    // 48 kHz mono: matches the assembly sample rate, so ffmpeg never has to
    // resample mid-concat (a resample between segments is audible as a click).
    await run('ffmpeg', [
      '-y',
      '-loglevel', 'error',
      '-i', aiff,
      '-ar', '48000',
      '-ac', '1',
      outPath,
    ]);
    await fs.rm(aiff, { force: true });

    return { path: outPath, durationSec: await probeDurationSec(outPath) };
  },
};
