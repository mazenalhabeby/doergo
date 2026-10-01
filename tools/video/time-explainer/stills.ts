/**
 * Real web stills for the "Time in HBCField" explainer — the screens the
 * storyboard shows, from the real app against the seeded ten-day job.
 *
 *   VIDEO_STORY=<state> node seed-video.ts   (once per snapshot)
 *   node time-explainer/stills.ts <state>     (this file)
 *
 * Stills land in time-explainer/stills/<state>-<shot>.png at 2× for sharpness.
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { ADMIN_LOGIN, DEMO_LOGIN, WEB_URL } from '../config.ts';
import { signIn } from '../capture/screen.ts';
import { STORY_TITLE } from '../story-ten-day.ts';

const state = process.argv[2] ?? 'done';
const OUT = new URL('./stills/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string, clip?: { selector: string; pad?: number }) {
  await page.waitForTimeout(900);
  // The dev overlay's badge has to be gone from every still.
  await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((n) => n.remove()));
  const path = `${OUT}${state}-${name}.png`;
  if (clip) {
    const box = await page.locator(clip.selector).first().boundingBox();
    if (box) {
      const p = clip.pad ?? 16;
      await page.screenshot({ path, clip: { x: Math.max(0, box.x - p), y: Math.max(0, box.y - p), width: box.width + 2 * p, height: box.height + 2 * p } });
      console.log('  ', path);
      return;
    }
  }
  await page.screenshot({ path });
  console.log('  ', path);
}

async function openStoryJob(page: Page) {
  await page.goto(`${WEB_URL}/tasks`, { waitUntil: 'domcontentloaded' });
  await page.locator(`text=${STORY_TITLE}`).first().waitFor({ timeout: 60_000 });
  await page.locator(`text=${STORY_TITLE}`).first().click();
  await page.waitForURL(/\/tasks\/[^/]+$/, { timeout: 60_000 });
  await page.locator('h1, [data-tour="task-header"]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'en-GB', timezoneId: 'Europe/London' });
  await signIn(page, state === 'handover' || state === 'office' ? DEMO_LOGIN : ADMIN_LOGIN);

  if (state === 'done') {
    await openStoryJob(page);
    await shot(page, 'task-top');
    await shot(page, 'jobtime-card', { selector: 'div.rounded-2xl:has-text("Job time")' });
    await shot(page, 'handover-card', { selector: 'div.rounded-2xl:has-text("Handover")' });
    // The activity panel: paused, resumed, the handover, the reassignment.
    const act = page.locator('[data-tour="task-activity"]');
    await act.scrollIntoViewIfNeeded();
    await act.locator('button').first().click().catch(() => undefined);
    await page.waitForTimeout(1500);
    await shot(page, 'activity', { selector: '[data-tour="task-activity"]' });

    // Reports → Job time, for each of the two.
    await page.goto(`${WEB_URL}/reports/job-time`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1:has-text("Job time")').waitFor({ timeout: 60_000 });
    await page.locator('button:has-text("Last month")').click();
    for (const who of ['Tobias Okafor', 'Priya Rhodes']) {
      await page.locator('[role="combobox"]').first().click();
      await page.waitForTimeout(800);
      const opts = await page.locator('[role="option"]').allInnerTexts();
      console.log('   options:', opts.slice(0, 12).join(' | '));
      await page.locator(`[role="option"]:has-text("${who}")`).click();
      await page.waitForTimeout(2500);
      await shot(page, `report-${who.split(' ')[0]!.toLowerCase()}`);
    }
  }

  if (state === 'handover') {
    // The board: the job paused, its note still owed.
    await page.goto(`${WEB_URL}/tasks`, { waitUntil: 'domcontentloaded' });
    await page.locator(`text=${STORY_TITLE}`).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shot(page, 'board');
    await openStoryJob(page);
    await shot(page, 'task-top');
    // Reassign: the warning, before anybody is picked.
    await page.locator('button:has-text("Reassign"), button:has-text("Assign")').first().click();
    await page.locator('text=/hasn.t written a handover/').waitFor({ timeout: 30_000 });
    await page.fill('#reassign-note', 'Tobias is off sick today. Call me if anything is unclear.');
    await shot(page, 'reassign-warning', { selector: '[role="dialog"]', pad: 24 });
  }

  if (state === 'office') {
    await openStoryJob(page);
    await shot(page, 'task-top');
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
