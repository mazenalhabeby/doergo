/**
 * Subtitles, one .srt per language, generated from the script and the times
 * the capture actually observed.
 *
 * WHY five sidecar files and not five videos: the footage is language-neutral —
 * the app's own UI is in English in the recording, and translating that would
 * mean re-seeding and re-capturing per language. A sidecar .srt is a few
 * kilobytes, YouTube picks the right one from the viewer's locale, and a
 * wording fix is a text edit rather than a re-render.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { LOCALES, type Locale } from '../config.ts';
import type { VideoScript } from '../script.ts';
import type { Timeline } from '../timeline.ts';

/** SRT wants HH:MM:SS,mmm — commas, not the dots WebVTT uses. */
function stamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const ms = Math.round((clamped % 1) * 1000);
  const total = Math.floor(clamped);
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss},${String(ms).padStart(3, '0')}`;
}

/** Broadcast convention: at most two lines of ~42 characters per cue. */
const MAX_LINE = 42;
const MAX_LINES = 2;
const MAX_CUE_CHARS = MAX_LINE * MAX_LINES;

/**
 * Split one beat's narration into cue-sized pieces, on word boundaries.
 *
 * ⚠️ A beat is one or two spoken sentences — often 10 seconds and 140
 * characters. Rendering that as a SINGLE cue means either a wall of text
 * covering a third of the picture, or squeezing it into two very long lines
 * nobody can read before it goes. Neither is acceptable, so a long beat
 * becomes several cues instead.
 *
 * (An earlier version tried to force everything into two lines by re-wrapping
 * at a wider width, and recursed forever the first time a sentence would not
 * fit — the render died at 95% with "Maximum call stack size exceeded". This
 * version has no recursion at all.)
 */
function splitIntoCues(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let chunk = '';

  for (const word of words) {
    const candidate = chunk ? `${chunk} ${word}` : word;
    if (chunk && candidate.length > MAX_CUE_CHARS) {
      chunks.push(chunk);
      chunk = word;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.length ? chunks : [text];
}

/** Break one cue across at most two lines, balanced so neither is a stub. */
function layout(cue: string): string {
  if (cue.length <= MAX_LINE) return cue;

  const words = cue.split(/\s+/);
  // Aim for halves, so a 60-character cue is 30/30 rather than 42/18.
  const target = Math.ceil(cue.length / 2);

  let first = '';
  let i = 0;
  for (; i < words.length; i += 1) {
    const candidate = first ? `${first} ${words[i]}` : words[i]!;
    if (first && candidate.length > target) break;
    first = candidate;
  }
  const second = words.slice(i).join(' ');
  return second ? `${first}\n${second}` : first;
}

export function renderSrt(script: VideoScript, timeline: Timeline, locale: Locale): string {
  const cues: string[] = [];
  let index = 1;

  for (const beat of script.beats) {
    const mark = timeline.beats.find((b) => b.id === beat.id);
    if (!mark) continue; // A beat the flow skipped simply gets no subtitle.

    /*
      The cues end when the narration stops, not when the beat does. A beat is
      held at least as long as its audio and sometimes longer (a slow page);
      a caption left standing over silence reads as a stuck player.
    */
    const spoken = mark.narrationSec || mark.endSec - mark.startSec;
    const window = Math.max(0.8, Math.min(spoken, mark.endSec - mark.startSec));

    const pieces = splitIntoCues(beat.narration[locale]);
    // Share the spoken window by character count — a long clause holds the
    // screen longer than a short one, which is roughly how speech works.
    const totalChars = pieces.reduce((n, p) => n + p.length, 0) || 1;

    let cursor = mark.startSec;
    for (const piece of pieces) {
      const span = (piece.length / totalChars) * window;
      const start = cursor;
      const end = cursor + span;
      cues.push(`${index}\n${stamp(start)} --> ${stamp(end)}\n${layout(piece)}\n`);
      index += 1;
      cursor = end;
    }
  }

  return `${cues.join('\n')}\n`;
}

export async function writeAllSrt(
  script: VideoScript,
  timeline: Timeline,
  outDir: string,
): Promise<string[]> {
  const written: string[] = [];
  for (const locale of LOCALES) {
    const file = path.join(outDir, `${script.id}.${locale}.srt`);
    await fs.writeFile(file, renderSrt(script, timeline, locale), 'utf8');
    written.push(file);
  }
  return written;
}
