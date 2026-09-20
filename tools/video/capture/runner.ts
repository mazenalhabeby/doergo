/**
 * The camera rig: a Playwright browser set up to be filmed rather than tested.
 *
 * The difference matters. A test wants to finish fast and does not care what
 * the intermediate frames look like; a recording wants a visible cursor,
 * unhurried movement, and a beat held on screen exactly as long as the
 * narration that describes it. Everything here exists for one of those.
 */

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  OUT_DIR,
  RECORDING_POSITION,
  VIEWPORT,
  WEB_URL,
  assertLocalWeb,
} from '../config.ts';
import type { BeatMark, Timeline } from '../timeline.ts';
import { probeDurationSec } from '../assemble/ffmpeg.ts';

/**
 * ⚠️ Playwright's video does NOT show the mouse pointer. The recording is a
 * compositor capture, and the cursor is drawn by the operating system outside
 * it — so a flow that clicks its way through the app produces footage where
 * things happen for no visible reason.
 *
 * So the page draws its own. This init script runs before any page script and
 * follows the real mouse, which means it also tracks Playwright's synthetic
 * moves. It is injected only in the recording browser and touches nothing the
 * app owns.
 */
const CURSOR_SCRIPT = `
(() => {
  const draw = () => {
    if (document.getElementById('__vidcursor')) return;
    const style = document.createElement('style');
    style.textContent = \`
      #__vidcursor {
        position: fixed; left: 0; top: 0; width: 22px; height: 22px;
        margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(37, 99, 235, 0.28);
        border: 2px solid rgba(37, 99, 235, 0.9);
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.35);
        pointer-events: none; z-index: 2147483647;
        transition: transform 90ms ease-out;
      }
      #__vidcursor.__down { transform: scale(0.6); background: rgba(37,99,235,0.55); }
      .__vidripple {
        position: fixed; width: 16px; height: 16px; margin: -8px 0 0 -8px;
        border-radius: 50%; border: 2px solid rgba(37, 99, 235, 0.8);
        pointer-events: none; z-index: 2147483646;
        animation: __vidripple 520ms ease-out forwards;
      }
      @keyframes __vidripple {
        to { transform: scale(3.2); opacity: 0; }
      }
    \`;
    document.head.appendChild(style);
    const dot = document.createElement('div');
    dot.id = '__vidcursor';
    document.body.appendChild(dot);

    let x = 0, y = 0;
    addEventListener('mousemove', (e) => {
      x = e.clientX; y = e.clientY;
      dot.style.left = x + 'px';
      dot.style.top = y + 'px';
    }, true);
    addEventListener('mousedown', () => {
      dot.classList.add('__down');
      const r = document.createElement('div');
      r.className = '__vidripple';
      r.style.left = x + 'px';
      r.style.top = y + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 560);
    }, true);
    addEventListener('mouseup', () => dot.classList.remove('__down'), true);
  };
  if (document.body) draw();
  else addEventListener('DOMContentLoaded', draw);
})();
`;

export interface StageOptions {
  /** Beat id -> how many seconds its narration runs. */
  narrationDurations: Record<string, number>;
  /** Names the output directory under out/. */
  videoId: string;
}

export interface Stage {
  page: Page;
  /**
   * Run one beat. The work inside happens at its own pace; the beat as a whole
   * is held until its narration has finished, so the picture never runs ahead
   * of the voice.
   */
  beat(id: string, body: (page: Page) => Promise<void>): Promise<void>;
  /**
   * Move the pointer onto something, visibly.
   *
   * Takes a Locator as well as a selector, because some targets can only be
   * named by relation — "the Configure button inside the card that says
   * Halstead Depot" is a `.filter({ hasText })`, and writing it as a CSS
   * string means guessing at class names that change.
   */
  moveTo(target: string | Locator): Promise<void>;
  /** Move onto something and click it. */
  click(target: string | Locator): Promise<void>;
  /** Type at a human speed. */
  type(target: string | Locator, text: string): Promise<void>;
  /** A deliberate pause — for letting a viewer read. */
  hold(seconds: number): Promise<void>;
  finish(): Promise<Timeline>;
}

/** Wall-clock seconds since the stage clock started. */
const now = () => Date.now();

export async function openStage(options: StageOptions): Promise<Stage> {
  assertLocalWeb(WEB_URL);

  const videoDir = path.join(OUT_DIR, options.videoId, 'capture');
  await fs.rm(videoDir, { recursive: true, force: true });
  await fs.mkdir(videoDir, { recursive: true });

  const browser: Browser = await chromium.launch({
    /*
      Headless. WHY: a headed browser records whatever the machine does to the
      window — a notification, a screen lock, the operator moving a mouse — and
      renders differently depending on the display. Headless gives the same
      frames on a laptop and on CI.
    */
    headless: true,
    args: [
      // Without this the recording shows Chromium's own scrollbars, which are
      // not part of the product and read as chrome around the app.
      '--hide-scrollbars',
      '--disable-blink-features=AutomationControlled',
      // Deterministic font rendering between runs.
      '--font-render-hinting=none',
      '--force-color-profile=srgb',
    ],
  });

  const context: BrowserContext = await browser.newContext({
    viewport: VIEWPORT,
    /*
      1 rather than 2. A retina capture is four times the pixels for a video
      that is downscaled to 1080p anyway, and it doubled capture time for no
      visible difference after encoding.
    */
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: VIEWPORT },
    /*
      ⚠️ Both halves are required for clock-in. The mutation calls
      getCurrentPosition directly and does not swallow a failure, so a context
      without the permission ends the video on "Location permission denied" —
      and a granted permission with no position set times out instead.
    */
    permissions: ['geolocation'],
    geolocation: { ...RECORDING_POSITION },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });

  await context.addInitScript(CURSOR_SCRIPT);

  /*
    Pin the theme.

    The app is dark by default (`defaultTheme="dark"`, `enableSystem={false}`
    in the root layout), so dark is what a real customer sees and what these
    videos should show. ⚠️ Stating it here rather than inheriting it means a
    future change to that default cannot silently re-skin every published
    video the next time one is re-rendered — and a light-mode take is
    VIDEO_THEME=light away. `colorScheme` on the context is NOT enough: the
    app reads next-themes' own storage key, not the OS preference.
  */
  const theme = process.env.VIDEO_THEME ?? 'dark';
  await context.addInitScript(`try { localStorage.setItem('hbcfield-theme', ${JSON.stringify(theme)}); } catch {}`);

  const page = await context.newPage();
  // Generous: a cold Next dev server compiles a route on first visit, which can
  // take many seconds. That is setup time, not beat time.
  page.setDefaultTimeout(45_000);

  const beats: BeatMark[] = [];
  let stageStart = 0;

  /** Where the pointer is now, so a move can be interpolated from it. */
  let cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height - 80 };

  /** A selector is the common case; a Locator is how a relational target arrives. */
  const resolve = (target: string | Locator): Locator =>
    typeof target === 'string' ? page.locator(target).first() : target.first();

  async function moveTo(selector: string | Locator): Promise<void> {
    const target = resolve(selector);
    await target.waitFor({ state: 'visible' });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`No bounding box for ${String(selector)}`);
    const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    /*
      Interpolated in steps with an ease-out. A single mouse.move() jumps the
      pointer, which on screen reads as a glitch rather than a movement;
      linear interpolation reads as a machine. The ease is what makes it look
      like somebody reaching for a button.
    */
    const steps = 22;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const eased = 1 - Math.pow(1 - t, 3);
      await page.mouse.move(
        cursor.x + (to.x - cursor.x) * eased,
        cursor.y + (to.y - cursor.y) * eased,
      );
      await page.waitForTimeout(14);
    }
    cursor = to;
    // A beat of stillness before the click, so the viewer sees the target.
    await page.waitForTimeout(280);
  }

  async function click(selector: string | Locator): Promise<void> {
    await moveTo(selector);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
  }

  async function type(selector: string | Locator, text: string): Promise<void> {
    await click(selector);
    // 55ms/char is fast enough not to bore and slow enough to read.
    await resolve(selector).pressSequentially(text, { delay: 55 });
  }

  async function hold(seconds: number): Promise<void> {
    await page.waitForTimeout(Math.round(seconds * 1000));
  }

  async function beat(id: string, body: (p: Page) => Promise<void>): Promise<void> {
    if (stageStart === 0) stageStart = now();
    const startSec = (now() - stageStart) / 1000;
    const narrationSec = options.narrationDurations[id] ?? 0;

    await body(page);

    /*
      Hold the beat until the narration has finished, plus a short tail.
      ⚠️ This, and not a table of timestamps, is what keeps voice and picture
      together: the beat's length is DERIVED from the audio, so changing a
      sentence or swapping the voice re-paces the video automatically on the
      next run.
    */
    const TAIL_SEC = 0.45;
    const elapsed = (now() - stageStart) / 1000 - startSec;
    const wanted = narrationSec + TAIL_SEC;
    if (elapsed < wanted) await hold(wanted - elapsed);

    const endSec = (now() - stageStart) / 1000;
    beats.push({ id, startSec, endSec, narrationSec });
    console.log(
      `    ${id.padEnd(16)} ${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s` +
        `  (narration ${narrationSec.toFixed(1)}s)`,
    );
  }

  async function finish(): Promise<Timeline> {
    const video = page.video();
    if (!video) throw new Error('Playwright recorded no video — was recordVideo set?');

    const lastEnd = beats.length ? beats[beats.length - 1]!.endSec : 0;

    // The file is only written and finalised on close.
    await context.close();
    await browser.close();

    const videoPath = await video.path();
    const durationSec = await probeDurationSec(videoPath);

    /*
      Setup happened before the first beat, so the video is longer than the
      beats account for. Attribute the difference to the head of the file and
      shift every mark by it — assembly then places narration against the real
      frames rather than against the stage clock.
    */
    const preRollSec = Math.max(0, durationSec - lastEnd);
    const shifted = beats.map((b) => ({
      ...b,
      startSec: b.startSec + preRollSec,
      endSec: b.endSec + preRollSec,
    }));

    return { videoPath, durationSec, preRollSec, beats: shifted };
  }

  return { page, beat, moveTo, click, type, hold, finish };
}
