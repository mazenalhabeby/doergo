/**
 * The text a human pastes into YouTube: title, description, chapters.
 *
 * WHY generate it rather than write it by hand: the chapter timestamps have to
 * match the finished video, and the finished video's timings change every time
 * the narration or the app does. Typed by hand they would be wrong by the
 * second re-render, and wrong chapters are worse than none.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { VideoScript } from '../script.ts';
import type { Timeline } from '../timeline.ts';
import { LOCALES } from '../config.ts';

/** YouTube chapter format: M:SS or H:MM:SS, and the first MUST be 0:00. */
function chapterStamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function renderYouTubeMetadata(
  script: VideoScript,
  timeline: Timeline,
  titleCardSec: number,
): string {
  const chapters: string[] = [];

  /*
    ⚠️ YouTube refuses the whole chapter list unless the first one is exactly
    0:00 — it does not report an error, the chapters simply never appear. The
    title card is that first chapter, which is honest as well as required.
  */
  chapters.push(`0:00 ${script.title.en}`);

  for (const beat of script.beats) {
    if (!beat.chapter) continue;
    const mark = timeline.beats.find((b) => b.id === beat.id);
    if (!mark) continue;
    chapters.push(`${chapterStamp(mark.startSec + titleCardSec)} ${beat.chapter.en}`);
  }

  const subtitleNote =
    `Subtitles are available in ${LOCALES.map((l) => l.toUpperCase()).join(', ')} — ` +
    `YouTube will pick yours automatically, or choose one from the CC menu.`;

  return [
    `TITLE`,
    `${script.title.en} — HBCField`,
    ``,
    `DESCRIPTION`,
    script.description.en,
    ``,
    `Chapters`,
    ...chapters,
    ``,
    subtitleNote,
    ``,
    `More at https://hbcfield.com`,
    ``,
    `---`,
    `Everyone and every company shown in this video is fictional. No real`,
    `customer or staff data appears at any point.`,
    ``,
    `UPLOAD CHECKLIST`,
    `  [ ] Upload ${script.id}.mp4`,
    `  [ ] Add each ${script.id}.<locale>.srt under Subtitles`,
    `  [ ] Paste the description above (chapters come with it)`,
    `  [ ] Copy the video id from the URL into`,
    `      packages/shared/src/video-guides.ts → ${script.tourIds.map((t) => `"${t}"`).join(', ')}`,
    ``,
  ].join('\n');
}

export async function writeYouTubeMetadata(
  script: VideoScript,
  timeline: Timeline,
  titleCardSec: number,
  outDir: string,
): Promise<string> {
  const file = path.join(outDir, `${script.id}.youtube.txt`);
  await fs.writeFile(file, renderYouTubeMetadata(script, timeline, titleCardSec), 'utf8');
  return file;
}
