/**
 * What a video script is, and how it is read.
 *
 * A script is data, not code: one JSON file per video under scripts/. It holds
 * the beats in order, and for each beat the narration in all five languages.
 *
 * WHY beats rather than a flat timeline with timestamps: timestamps typed by
 * hand go stale the moment the app renders a millisecond slower, and then
 * somebody has to re-sync by ear. A beat has no time of its own. The voice
 * step measures how long its narration takes to speak, the capture step holds
 * that beat on screen for at least that long, and the subtitle step reads the
 * times the capture actually observed. Nothing is ever hand-synced.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, LOCALES, type Locale } from './config.ts';

/** Every locale must be present — a missing one would silently ship no subtitles. */
export type Localized = Record<Locale, string>;

export interface Beat {
  /** Stable id. The capture flow refers to beats by this, so order can change. */
  id: string;
  /** Spoken over this beat, one sentence or two. */
  narration: Localized;
  /**
   * Becomes a YouTube chapter marker when set. Not every beat deserves one —
   * chapters every eight seconds are noise.
   */
  chapter?: Localized;
  /** Held on screen at least this long even if the narration is shorter. */
  minSeconds?: number;
}

export interface VideoScript {
  /** File-safe id; names the output directory and the mp4. */
  id: string;
  /** The tours in packages/shared/src/video-guides.ts this video answers. */
  tourIds: string[];
  title: Localized;
  /** Shown on the title card under the title. */
  subtitle: Localized;
  /** The YouTube description body, above the auto-generated chapter list. */
  description: Localized;
  beats: Beat[];
}

function assertLocalized(where: string, value: unknown): Localized {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${where}: expected an object of locale -> text`);
  }
  const record = value as Record<string, unknown>;
  for (const locale of LOCALES) {
    if (typeof record[locale] !== 'string' || !record[locale]) {
      // Loud, because a missing locale means that language's viewers get no
      // subtitles at all — and nothing else in the pipeline would notice.
      throw new Error(`${where}: missing or empty "${locale}"`);
    }
  }
  return record as Localized;
}

export async function loadScript(id: string): Promise<VideoScript> {
  const file = path.join(ROOT, 'scripts', `${id}.json`);
  const raw = JSON.parse(await fs.readFile(file, 'utf8')) as VideoScript;

  assertLocalized(`${id}.title`, raw.title);
  assertLocalized(`${id}.subtitle`, raw.subtitle);
  assertLocalized(`${id}.description`, raw.description);
  if (!Array.isArray(raw.beats) || raw.beats.length === 0) {
    throw new Error(`${id}: has no beats`);
  }
  const seen = new Set<string>();
  for (const beat of raw.beats) {
    if (seen.has(beat.id)) throw new Error(`${id}: duplicate beat id "${beat.id}"`);
    seen.add(beat.id);
    assertLocalized(`${id}.beats.${beat.id}.narration`, beat.narration);
    if (beat.chapter) assertLocalized(`${id}.beats.${beat.id}.chapter`, beat.chapter);
  }
  return raw;
}
