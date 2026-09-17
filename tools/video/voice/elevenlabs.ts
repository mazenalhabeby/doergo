/**
 * ElevenLabs narration.
 *
 * The system voice costs nothing and is the right default, but it READS where
 * this one performs — it stresses the word the sentence is about and pauses
 * where a person would. On a video carrying the product's name in public, that
 * gap is the difference between "a demo" and "a company".
 *
 * ⚠️ THE KEY IS NEVER IN THIS REPO. It is read from `ELEVENLABS_API_KEY` in the
 * environment (`.env` is already gitignored), and `isAvailable()` answers false
 * without it — so a machine that has no key falls back to `say` instead of
 * failing a render that has already spent two minutes driving a browser.
 *
 * ⚠️ NOTHING ELSE IN THE PIPELINE CHANGES. Assembly measures durations off the
 * produced files and the capture paces itself to the narration, so a slower or
 * faster voice re-paces the video on the next run with nothing adjusted by hand.
 *
 * ⚠️ CHARACTERS ARE THE BILLED UNIT, so a re-render costs money where `say` is
 * free. Iterate on wording with the default adapter and switch to this one for
 * the take you intend to publish.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SynthesisRequest, SynthesisResult, VoiceAdapter } from './types.ts';
import { probeDurationSec } from '../assemble/ffmpeg.ts';

const run = promisify(execFile);

/**
 * Malia — Natural American. The product's narrator.
 *
 * ⚠️ CHOSEN, not defaulted. Every video in the library has to sound like the
 * same person; a voice that drifts from one to the next reads as several
 * companies. Change it deliberately and re-render the whole library, never one
 * video.
 *
 * ⚠️ A voice id is NOT a secret and is safe in the repo — it names a voice, it
 * grants nothing. The key that may speak with it lives in the environment.
 *
 * Overridable for a one-off test: `VIDEO_ELEVEN_VOICE`.
 */
const VOICE_ID = process.env.VIDEO_ELEVEN_VOICE ?? 'klHXweKCxxmBYweAPtk4';

/**
 * `multilingual_v2` rather than the English-only model, even while only English
 * is being produced. It is the same price, and it means the de/es/fr/it scripts
 * can be narrated later by the same voice without re-recording English so the
 * five versions match.
 */
const MODEL_ID = process.env.VIDEO_ELEVEN_MODEL ?? 'eleven_multilingual_v2';

const API = 'https://api.elevenlabs.io/v1';

const key = () => process.env.ELEVENLABS_API_KEY?.trim();

export const elevenLabsAdapter: VoiceAdapter = {
  name: `elevenlabs(${MODEL_ID})`,

  async isAvailable() {
    return Boolean(key());
  },

  async synthesize({ text, outPath, previousText, nextText }: SynthesisRequest): Promise<SynthesisResult> {
    const apiKey = key();
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

    await fs.mkdir(path.dirname(outPath), { recursive: true });

    const res = await fetch(`${API}/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        /*
          The neighbouring lines, so the delivery carries across the join.
          They are NOT spoken — the model reads them only to decide how this
          sentence should sound. Without them a two-beat test came back 6.4
          LUFS apart and sounded like two narrators.
        */
        ...(previousText ? { previous_text: previousText } : {}),
        ...(nextText ? { next_text: nextText } : {}),
        voice_settings: {
          /*
            Steady rather than expressive. A narrator who performs differently
            in each beat of one video sounds like several people; `stability`
            high and `style` at zero keeps twenty videos sounding like one
            product.
          */
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      /*
        ⚠️ The body carries the reason (quota spent, bad voice id, key revoked)
        and NEVER the key. Surfacing it is what stops a failed render looking
        like a bug in the pipeline — but read it here rather than logging the
        request, which would print the header.
      */
      const detail = await res.text().catch(() => '');
      throw new Error(
        `ElevenLabs ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
      );
    }

    /*
      MP3 in, 48 kHz mono WAV out — matching `say`, because a sample-rate change
      between segments is audible as a click on concat.

      ⚠️ AND NORMALISED TO A FIXED LOUDNESS. Context makes consecutive beats
      sound like one person; it does not make them the same VOLUME, and a beat
      6 dB quieter than the one before still reads as a different take. Every
      clip is brought to −16 LUFS — the level YouTube expects, so the platform
      does not apply its own gain unevenly afterwards.
    */
    const mp3 = `${outPath}.mp3`;
    await fs.writeFile(mp3, Buffer.from(await res.arrayBuffer()));
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', mp3,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar', '48000', '-ac', '1',
      outPath,
    ]);
    await fs.rm(mp3, { force: true });

    return { path: outPath, durationSec: await probeDurationSec(outPath) };
  },
};
