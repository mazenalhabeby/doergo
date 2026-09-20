/**
 * A frame from each beat, as a contact sheet.
 *
 *   node tools/video/check-frames.ts <video-id> [fraction]
 *
 * ⚠️ THE ONE CHECK THAT CATCHES THE DEFECT THIS PIPELINE ACTUALLY PRODUCES:
 * a narration describing something that is not on screen. Nothing in a render
 * log reports it — every beat "succeeded" — and watching three minutes per take
 * is slower than looking at twelve stills.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUT_DIR } from './config.ts';

const run = promisify(execFile);
const TITLE_CARD_SEC = 3.5;

const videoId = process.argv[2];
const fraction = Number(process.argv[3] ?? 0.85);
if (!videoId) throw new Error('usage: check-frames.ts <video-id> [fraction]');

const dir = path.join(OUT_DIR, videoId);
/*
  ⚠️ A BEAT'S TIME IS ALREADY IN RECORDING-CLOCK SECONDS — it includes the
  pre-roll, because the runner measures from the start of the recording and the
  first beat's startSec equals preRollSec. Assembly puts the title card in
  front and trims NOTHING, so the only offset is that card. Subtracting the
  pre-roll as well (which this file did at first) looks several seconds early,
  which on a beat lasting five is a frame from the beat before.
*/
const timeline = JSON.parse(
  await fs.readFile(path.join(dir, `${videoId}.timeline.json`), 'utf8'),
) as { preRollSec: number; beats: Array<{ id: string; startSec: number; endSec: number }> };

const out = path.join(dir, 'frames');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const mp4 = path.join(dir, `${videoId}.mp4`);
for (const [i, beat] of timeline.beats.entries()) {
  const at = beat.startSec + (beat.endSec - beat.startSec) * fraction + TITLE_CARD_SEC;
  const file = path.join(out, `${String(i + 1).padStart(2, '0')}-${beat.id}.png`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', mp4,
    '-frames:v', '1', '-vf', 'scale=470:-1', file]);
  console.log(`  ${String(i + 1).padStart(2, '0')} ${beat.id.padEnd(20)} ${at.toFixed(1)}s`);
}

const columns = 4;
const rows = Math.ceil(timeline.beats.length / columns);
const sheet = path.join(dir, `${videoId}.frames.png`);
await run('ffmpeg', ['-y', '-loglevel', 'error', '-pattern_type', 'glob',
  '-i', path.join(out, '*.png'),
  '-filter_complex', `tile=${columns}x${rows}:padding=5:color=gray`, sheet]);
console.log(`\n  ${sheet}`);
