/**
 * "Work that repeats" — video 09.
 *
 * The recurring templates screen, which in a fresh organisation is empty — and
 * that is the right place to start, because the video is about making the
 * first one.
 *
 * ⚠️ THE DIALOG HAS NO ASSIGNEE FIELD. The narration said "and who should be
 * on it" until this was filmed; the template carries the work, the workspace
 * and the interval, and who does it is decided when the job appears. A
 * sentence naming a field that is not there is the defect this pipeline makes
 * most easily.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, dialogWith, pickFromSelect, signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const TEMPLATE = 'Quarterly chiller service — Brambleside';
const DETAIL = 'Filters, belts, coil clean, log the readings and leave a copy with the site manager.';

export async function captureWorkThatRepeats(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'work-that-repeats' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  /*
    Reached by URL: recurring templates live behind the tasks screen's own
    menu, and opening that menu is not what any sentence here is about. The
    app is already running, so nothing re-boots.
  */
  await page.goto(`${WEB_URL}/tasks/recurring`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Recurring Tasks', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('theSameVisit', async () => {
    await stage.hold(2.0);
  });

  await stage.beat('describeItOnce', async () => {
    await stage.click('button:has-text("Template")');
    const form = dialogWith('input[placeholder*="Weekly HVAC"]');
    await page.locator(form).waitFor({ state: 'visible', timeout: 20_000 });
    const title = page.locator(`${DIALOG} input[placeholder*="Weekly HVAC"]`).first();
    await title.click();
    await typeSlowly(title, TEMPLATE);
    const description = page.locator(`${DIALOG} textarea`).first();
    await description.click();
    await typeSlowly(description, DETAIL);
    await pickFromSelect(page, /No workspace/i, 'Brambleside');
  });

  await stage.beat('howOften', async () => {
    await pickFromSelect(page, /Weekly|Frequency/i, 'Monthly');
    await stage.hold(1.6);
  });

  await stage.beat('whenItStarts', async () => {
    /*
      The start date is a calendar in a popover — `table button`, past days
      disabled, so the enabled ones count forward from today.
    */
    /*
      ⚠️ THERE IS NO CALENDAR HERE. Start date is a plain `input[type=date]`,
      already filled with today — unlike the job dialog, which uses a popover
      calendar. Two screens, two controls for the same idea, and the first cut
      of this beat spent 45 seconds waiting for a trigger that does not exist.
    */
    const start = page.locator(`${DIALOG} input[type="date"]`).first();
    await start.scrollIntoViewIfNeeded();
    await stage.moveTo(start);
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await start.fill(inTenDays);
    await page.waitForTimeout(600);
    await stage.hold(1.0);
  });

  await stage.beat('saveIt', async () => {
    const form = dialogWith('input[placeholder*="Weekly HVAC"]');
    await stage.click(`${DIALOG} button:text-is("Create")`);
    try {
      await page.locator(form).waitFor({ state: 'hidden', timeout: 30_000 });
    } catch {
      const said = (await page.locator(form).innerText().catch(() => '')).slice(0, 400);
      throw new Error(`The template was not created. The dialog still says:\n${said}`);
    }
    await page.getByText(TEMPLATE, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
  });

  await stage.beat('itRunsItself', async () => {
    await stage.moveTo(`text=${TEMPLATE}`);
    await stage.hold(2.0);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 180);
    await stage.hold(1.2);
  });

  return stage.finish();
}
