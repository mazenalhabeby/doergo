/**
 * The one command.
 *
 *   node tools/video/render.ts clock-in-out
 *
 * Order matters, and it is the order that removes hand-syncing:
 *
 *   1. SEED    the fictional organisation (unless --skip-seed)
 *   2. NARRATE every beat, and MEASURE how long each one takes to say
 *   3. CAPTURE the real app, holding each beat for as long as its narration
 *   4. ASSEMBLE title card + footage + end card, lay the voice on at the
 *      observed marks, write one .srt per language and the YouTube text
 *
 * Step 2 before step 3 is the whole trick. Narration is never stretched to fit
 * the picture and the picture is never cut to fit the narration — the picture
 * is PACED by the narration while it is being recorded, so they cannot drift.
 * Change a sentence, or swap `say` for a paid voice, and the next run
 * re-paces itself with nothing to adjust by hand.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUT_DIR, ROOT, assertLocalDatabase, assertLocalWeb, WEB_URL } from './config.ts';
import { loadScript, type VideoScript } from './script.ts';
import { selectVoiceAdapter } from './voice/index.ts';
import { captureClockInOut } from './capture/flows/clock-in-out.ts';
import { captureVoiceTest } from './capture/flows/voice-test.ts';
import type { Timeline } from './timeline.ts';
import { renderCards } from './assemble/cards.ts';
import { writeAllSrt } from './assemble/srt.ts';
import { writeYouTubeMetadata } from './assemble/youtube.ts';
import {
  assertToolchain,
  buildNarrationTrack,
  burnSubtitles,
  concatSegments,
  muxAudio,
  normaliseFootage,
  probeDurationSec,
  stillToSegment,
} from './assemble/ffmpeg.ts';

const run = promisify(execFile);

/** How long the cards hold. Long enough to read, short enough not to stall. */
const TITLE_CARD_SEC = 3.5;
const END_CARD_SEC = 3.0;

/**
 * The flows, by script id. A new video is a script, a flow, and a line here.
 * Deliberately a lookup rather than a dynamic import of a path built from the
 * argument — that would let a typo reach the filesystem.
 */
const FLOWS: Record<string, (d: Record<string, number>) => Promise<Timeline>> = {
  'clock-in-out': captureClockInOut,
  // Twenty seconds, two beats. A cheap way to hear a voice without spending a
  // full script's characters every time somebody wants to judge one.
  'voice-test': captureVoiceTest,
};

interface Args {
  videoId: string;
  skipSeed: boolean;
  skipCapture: boolean;
  burnIn: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith('--'));
  return {
    videoId: positional[0] ?? 'clock-in-out',
    skipSeed: argv.includes('--skip-seed'),
    // For iterating on cards, subtitles or audio without re-driving the browser.
    skipCapture: argv.includes('--skip-capture'),
    burnIn: argv.includes('--burn-in'),
  };
}

async function narrate(
  script: VideoScript,
  outDir: string,
): Promise<{ clips: Array<{ id: string; file: string; durationSec: number }>; voice: string }> {
  const voice = selectVoiceAdapter();
  if (!(await voice.isAvailable())) {
    throw new Error(
      `The "${voice.name}" voice is not available on this machine.\n` +
        (process.platform === 'darwin'
          ? 'Check that `say` works.'
          : 'macOS `say` is the default and needs macOS. Point VIDEO_TTS at another adapter.'),
    );
  }

  const dir = path.join(outDir, 'narration');
  await fs.mkdir(dir, { recursive: true });

  const clips: Array<{ id: string; file: string; durationSec: number }> = [];
  /*
    ⚠️ Each beat is told what comes before and after it. A narrator handed one
    sentence at a time with no context chooses fresh pitch and energy for each,
    and the video sounds like several people reading in turn.
  */
  for (const [i, beat] of script.beats.entries()) {
    const file = path.join(dir, `${beat.id}.wav`);
    const { durationSec } = await voice.synthesize({
      text: beat.narration.en,
      outPath: file,
      previousText: script.beats[i - 1]?.narration.en,
      nextText: script.beats[i + 1]?.narration.en,
    });
    clips.push({ id: beat.id, file, durationSec });
    console.log(`    ${beat.id.padEnd(16)} ${durationSec.toFixed(1)}s`);
  }
  return { clips, voice: voice.name };
}

/**
 * Ask the dev server for every route the flow will visit, before the camera
 * rolls.
 *
 * ⚠️ WHY THIS EXISTS. `next dev` compiles a route the first time it is
 * requested, and that took 13 seconds for /attendance on the first run. The
 * beat is held for at least its narration, so the narration finished and the
 * video then sat in silence on a spinner for the rest of the compile — dead
 * air that no amount of re-timing fixes, because it is not a timing problem.
 * A plain GET is enough: the route module compiles even though the response
 * then redirects an unauthenticated visitor to the login page.
 */
async function warmRoutes(routes: string[]): Promise<void> {
  for (const route of routes) {
    const startedAt = Date.now();
    try {
      await fetch(`${WEB_URL}${route}`, { redirect: 'manual' });
    } catch {
      // A dev server that refuses one route still lets the rest warm; the
      // capture will fail with a much clearer message if it is really down.
    }
    const ms = Date.now() - startedAt;
    if (ms > 1500) console.log(`    ${route.padEnd(18)} compiled in ${(ms / 1000).toFixed(1)}s`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();

  // Both rails first, before anything is created or any browser opens.
  assertLocalWeb(WEB_URL);
  if (!args.skipSeed) assertLocalDatabase(process.env.DATABASE_URL);
  await assertToolchain();

  const script = await loadScript(args.videoId);
  const flow = FLOWS[script.id];
  if (!flow) {
    throw new Error(
      `No capture flow registered for "${script.id}". Add one to FLOWS in render.ts.`,
    );
  }

  const outDir = path.join(OUT_DIR, script.id);
  await fs.mkdir(outDir, { recursive: true });

  console.log(`\n▸ Rendering "${script.title.en}"\n`);

  // ── 1. The stage ─────────────────────────────────────────────────────────
  if (args.skipSeed) {
    console.log('  1/4  seed            skipped (--skip-seed)');
  } else {
    console.log('  1/4  seed');
    const { stdout } = await run('node', [path.join(ROOT, 'seed-video.ts')], {
      maxBuffer: 8 * 1024 * 1024,
    });
    const summary = stdout.split('\n').filter((l) => l.trim().startsWith('  ') && l.includes(','));
    for (const line of summary) console.log(`   ${line.trim()}`);
  }

  // ── 2. The voice, measured ───────────────────────────────────────────────
  console.log('\n  2/4  narration');
  const { clips, voice } = await narrate(script, outDir);
  const narrationDurations = Object.fromEntries(clips.map((c) => [c.id, c.durationSec]));

  // ── 3. The app, paced by the voice ───────────────────────────────────────
  const timelineFile = path.join(outDir, `${script.id}.timeline.json`);
  let timeline: Timeline;
  if (args.skipCapture) {
    console.log('\n  3/4  capture          skipped (--skip-capture), reusing the last timeline');
    timeline = JSON.parse(await fs.readFile(timelineFile, 'utf8')) as Timeline;
  } else {
    console.log('\n  3/4  capture');
    await warmRoutes(['/login', '/dashboard', '/my/attendance', '/attendance']);
    timeline = await flow(narrationDurations);
    await fs.writeFile(timelineFile, JSON.stringify(timeline, null, 2), 'utf8');
    console.log(
      `    recorded ${timeline.durationSec.toFixed(1)}s ` +
        `(${timeline.preRollSec.toFixed(1)}s of setup before the first beat)`,
    );
  }

  // ── 4. Assembly ──────────────────────────────────────────────────────────
  console.log('\n  4/4  assembly');
  const work = path.join(outDir, 'work');
  await fs.mkdir(work, { recursive: true });

  const cards = await renderCards(work, { title: script.title.en, subtitle: script.subtitle.en });
  const titleSeg = await stillToSegment(cards.titleCard, TITLE_CARD_SEC, path.join(work, 'title.mp4'));
  const endSeg = await stillToSegment(cards.endCard, END_CARD_SEC, path.join(work, 'end.mp4'));
  const body = await normaliseFootage(timeline.videoPath, path.join(work, 'body.mp4'));

  const silent = await concatSegments([titleSeg, body, endSeg], path.join(work, 'silent.mp4'));
  const totalSec = await probeDurationSec(silent);

  /*
    Every mark shifts by the title card, because the concat put it in front.
    ⚠️ The SAME offset has to reach the subtitles and the chapter list, or the
    captions run one card ahead of the voice — which is exactly the class of
    bug the timing manifest exists to prevent, so it is applied once, here.
  */
  const shifted: Timeline = {
    ...timeline,
    beats: timeline.beats.map((b) => ({
      ...b,
      startSec: b.startSec + TITLE_CARD_SEC,
      endSec: b.endSec + TITLE_CARD_SEC,
    })),
  };

  const narrationTrack = await buildNarrationTrack(
    clips.map((c) => {
      const mark = shifted.beats.find((b) => b.id === c.id);
      return { file: c.file, atSec: mark ? mark.startSec : 0 };
    }),
    totalSec,
    path.join(work, 'narration.m4a'),
  );

  const finalMp4 = path.join(outDir, `${script.id}.mp4`);
  await muxAudio(silent, narrationTrack, finalMp4);

  const srtFiles = await writeAllSrt(script, shifted, outDir);
  const metaFile = await writeYouTubeMetadata(script, timeline, TITLE_CARD_SEC, outDir);

  if (args.burnIn) {
    const preview = path.join(outDir, `${script.id}.preview-en.mp4`);
    await burnSubtitles(finalMp4, srtFiles[0]!, preview);
    console.log(`    preview with burned-in captions → ${path.relative(ROOT, preview)}`);
  }

  const finalSec = await probeDurationSec(finalMp4);
  const mins = Math.floor(finalSec / 60);
  const secs = Math.round(finalSec % 60);

  console.log(`\n▸ Done in ${((Date.now() - started) / 1000).toFixed(0)}s — voice: ${voice}\n`);
  console.log(`  ${path.relative(ROOT, finalMp4)}   ${mins}:${String(secs).padStart(2, '0')}`);
  for (const srt of srtFiles) console.log(`  ${path.relative(ROOT, srt)}`);
  console.log(`  ${path.relative(ROOT, metaFile)}`);
  console.log('');
}

main().catch((err) => {
  const e = err as Error;
  console.error(`\n✗ ${e.message}\n`);
  // The stack matters here: most failures are an ffmpeg filter or a selector,
  // and the message alone rarely says which step produced it.
  if (process.env.VIDEO_DEBUG) console.error(e.stack);
  process.exit(1);
});
