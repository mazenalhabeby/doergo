/**
 * Assembly, with ffmpeg and nothing else.
 *
 * ⚠️ WHY NOT REMOTION. Remotion was the obvious candidate for the title and
 * end cards, and it was rejected on purpose. It would add a React renderer
 * plus its own headless Chromium — hundreds of megabytes and a per-frame
 * render loop — to draw two static cards and burn some text. Meanwhile this
 * pipeline already runs Playwright for capture, and Playwright screenshots an
 * HTML page at exactly the recording viewport for free. So the cards are real
 * HTML built from the product's own design tokens (assemble/cards.ts),
 * screenshotted once, and held on screen by ffmpeg's loop filter. That is one
 * PNG and one `-loop 1` per card versus a second rendering stack, and the
 * cards look like the product rather than like ffmpeg's drawtext.
 *
 * Captions are a sidecar .srt per language rather than burned in, for a reason
 * that outranks appearance: burning captions bakes one language into the
 * pixels and would mean five renders of the same footage. YouTube reads .srt
 * natively and picks by viewer locale, so one video carries all five.
 * `burnSubtitles` exists only for local preview.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT } from '../config.ts';

const run = promisify(execFile);

/** ffmpeg is chatty on stderr even when it succeeds; only surface real failures. */
async function ffmpeg(args: string[]): Promise<void> {
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(`ffmpeg failed:\n${e.stderr ?? e.message}`);
  }
}

export async function probeDurationSec(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not read a duration from ${file}`);
  return seconds;
}

export async function assertToolchain(): Promise<void> {
  for (const tool of ['ffmpeg', 'ffprobe']) {
    try {
      await run(tool, ['-version']);
    } catch {
      throw new Error(`${tool} is not on PATH. Install it with: brew install ffmpeg`);
    }
  }
}

/**
 * A still PNG becomes a video segment of a given length.
 *
 * The scale/pad pair is the same one used for the footage so that every
 * segment is byte-compatible for the concat below: identical resolution,
 * pixel format, frame rate and timebase. Concat demuxing anything mismatched
 * produces a file that plays for the first segment and then freezes.
 */
export async function stillToSegment(png: string, seconds: number, out: string): Promise<string> {
  await ffmpeg([
    '-loop', '1',
    '-t', String(seconds),
    '-i', png,
    '-f', 'lavfi',
    // A silent track of the same length. WHY: concat requires every segment to
    // have the same streams. A card with no audio stream against footage that
    // has one drops the audio of everything after it.
    '-t', String(seconds),
    '-i', 'anullsrc=channel_layout=mono:sample_rate=48000',
    '-vf', scalePad(),
    '-r', String(OUTPUT.fps),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    out,
  ]);
  return out;
}

/**
 * Capture is 1440x900 (16:10); YouTube wants 1920x1080 (16:9). Upscale to fit
 * and letterbox the remainder rather than stretching — a stretched UI looks
 * subtly wrong in a way viewers notice without being able to name.
 */
function scalePad(): string {
  const { width, height } = OUTPUT;
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=#0F172A,` +
    `setsar=1`
  );
}

/** Normalise raw Playwright footage into the same shape as the card segments. */
export async function normaliseFootage(input: string, out: string): Promise<string> {
  await ffmpeg([
    '-i', input,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=mono:sample_rate=48000',
    '-vf', scalePad(),
    '-r', String(OUTPUT.fps),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    out,
  ]);
  return out;
}

/**
 * Lay the per-beat narration onto one silent track at the times the capture
 * actually reached each beat.
 *
 * WHY place by offset rather than concatenating the clips back to back:
 * capture paces itself to the narration, but a page that loads faster or
 * slower than last run shifts a beat by a few hundred milliseconds. Placing
 * each clip at its observed mark keeps voice and picture together even when
 * the run drifts; concatenation would accumulate the drift across the video.
 */
export async function buildNarrationTrack(
  clips: Array<{ file: string; atSec: number }>,
  totalSec: number,
  out: string,
): Promise<string> {
  if (clips.length === 0) {
    await ffmpeg([
      '-f', 'lavfi',
      '-t', String(totalSec),
      '-i', 'anullsrc=channel_layout=mono:sample_rate=48000',
      '-c:a', 'aac', '-b:a', '192k',
      out,
    ]);
    return out;
  }

  const inputs: string[] = [];
  const filters: string[] = [];
  for (const [i, clip] of clips.entries()) {
    inputs.push('-i', clip.file);
    // adelay takes milliseconds, and needs one value per channel.
    filters.push(`[${i}:a]adelay=${Math.round(clip.atSec * 1000)}:all=1[a${i}]`);
  }

  const mixInputs = clips.map((_, i) => `[a${i}]`).join('');
  // normalize=0 keeps each clip at its recorded level. With normalization on,
  // amix divides by the number of inputs, so an eight-beat video comes out
  // eight times quieter than a one-beat one.
  filters.push(`${mixInputs}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[mix]`);
  filters.push(`[mix]apad,atrim=0:${totalSec.toFixed(3)},asetpts=N/SR/TB[out]`);

  await ffmpeg([
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-ar', '48000',
    '-ac', '1',
    '-c:a', 'aac',
    '-b:a', '192k',
    out,
  ]);
  return out;
}

/** Join pre-normalised segments without re-encoding. */
export async function concatSegments(segments: string[], out: string): Promise<string> {
  const listFile = `${out}.concat.txt`;
  await fs.writeFile(
    listFile,
    segments.map((s) => `file '${path.resolve(s).replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
  await fs.rm(listFile, { force: true });
  return out;
}

/** Replace a video's audio with the narration track. */
export async function muxAudio(video: string, audio: string, out: string): Promise<string> {
  await ffmpeg([
    '-i', video,
    '-i', audio,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    // faststart moves the index to the front so the file starts playing before
    // it has fully downloaded — which is how YouTube ingests and how anybody
    // reviewing the local mp4 over a share will open it.
    '-movflags', '+faststart',
    '-shortest',
    out,
  ]);
  return out;
}

/**
 * Burn an .srt into the picture. Preview only — the published file ships
 * sidecar subtitles so one render serves five languages.
 */
export async function burnSubtitles(video: string, srt: string, out: string): Promise<string> {
  const escaped = srt.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  await ffmpeg([
    '-i', video,
    '-vf',
    `subtitles='${escaped}':force_style='FontName=Helvetica,FontSize=22,PrimaryColour=&HFFFFFF&,` +
      `OutlineColour=&H90000000&,BorderStyle=3,Outline=2,Shadow=0,MarginV=48'`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    out,
  ]);
  return out;
}
