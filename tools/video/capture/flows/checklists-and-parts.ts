/**
 * "Checklists and sub-jobs" — video 10.
 *
 * ⚠️ NOTHING IS UPLOADED, AND THAT IS DELIBERATE. The attachments panel is
 * shown as the place things land, never used: S3 here is the real object
 * store, and a video should not put demo files in it. The narration says the
 * photographs come back from site — which is true, and is the phone's video.
 *
 * ⚠️ THE CHECKLIST CANNOT BE SET IN THE CREATE DIALOG — the dialog sends
 * `checklistItems`, the gateway's DTO has no such property, and one item makes
 * the whole save fail. It is filmed here, on the job, where the feature
 * genuinely works through its own endpoint.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { goTo, reveal, signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const JOB = 'Quarterly HVAC service — Block B';
const CHECKLIST = [
  'Isolate and lock off the supply',
  'Filters, belts and coil clean',
  'Log inlet and outlet temperatures',
];
const SUBTASK = 'Second visit — replace the corroded damper linkage';
const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';

export async function captureChecklistsAndParts(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'checklists-and-parts' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });

  const link = page.getByText(JOB, { exact: false }).first().locator('xpath=ancestor-or-self::a').first();
  await link.waitFor({ state: 'visible', timeout: 45_000 });
  const href = await link.getAttribute('href');
  await link.click();
  await page.waitForURL(/\/tasks\/[^/]+$/, { timeout: 8_000 }).catch(async () => {
    if (href) await page.goto(`${WEB_URL}${href}`, { waitUntil: 'domcontentloaded' });
  });
  await page.locator('[data-tour="task-header"]').waitFor({ state: 'visible', timeout: 30_000 });
  await stage.hold(0.8);

  await stage.beat('rarelyOneThing', async () => {
    await stage.moveTo('[data-tour="task-description"]');
    await stage.hold(1.6);
  });

  await stage.beat('whatFinishedMeans', async () => {
    await openPanel(page, 'task-checklist', 'Checklist');
    await stage.moveTo('[data-tour="task-checklist"]');
    await stage.hold(1.2);
  });

  await stage.beat('itemByItem', async () => {
    const input = page.locator('[data-tour="task-checklist"] input').first();
    await input.waitFor({ state: 'visible', timeout: 20_000 });
    for (const item of CHECKLIST) {
      await input.click();
      await typeSlowly(input, item);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }
  });

  await stage.beat('tickedOnSite', async () => {
    /*
      ⚠️ THE TICK IS NOT A CHECKBOX. It is a plain `<button>` with no role and
      no input behind it — styled as a box, drawn with a tick when complete. So
      neither `[role="checkbox"]` nor `input[type=checkbox]` finds it, and both
      wait the full timeout. It is the first button inside a row, and the row
      carries `group`; the panel's own header is a button too, which is why
      this is scoped to the row rather than to the panel.
    */
    const tick = page.locator('[data-tour="task-checklist"] .group button').first();
    await stage.moveTo(tick);
    await tick.click();
    await page.waitForTimeout(700);
    await stage.hold(1.2);
  });

  await stage.beat('twoVisits', async () => {
    await openPanel(page, 'task-subtasks', 'Subtasks');
    await stage.moveTo('[data-tour="task-subtasks"]');
    await stage.hold(1.2);
  });

  await stage.beat('eachOneReal', async () => {
    /*
      ⚠️ THE SUB-JOB FIELD DOES NOT EXIST UNTIL "Add" IS PRESSED. Opening the
      panel is not enough: an empty panel shows a sentence and a button, and
      the input is mounted only by the button. Waiting for it first is twenty
      seconds spent on an element nothing had asked for yet.
    */
    const add = page.locator('[data-tour="task-subtasks"] button').filter({ hasText: /^Add$/ }).first();
    if (await add.isVisible().catch(() => false)) {
      await stage.click(add);
      await page.waitForTimeout(500);
    }
    const input = page.locator('[data-tour="task-subtasks"] input').first();
    await input.waitFor({ state: 'visible', timeout: 20_000 });
    await input.click();
    await typeSlowly(input, SUBTASK);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(900);
    await stage.hold(1.0);
  });

  await stage.beat('whatComesBack', async () => {
    await openPanel(page, 'task-attachments', 'Attachments');
    await reveal(page, '[data-tour="task-attachments"]', 1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 260);
    await stage.hold(1.2);
  });

  return stage.finish();
}

/**
 * Open one of the job's collapsible panels.
 *
 * ⚠️ THEY ARE COLLAPSED WHEN EMPTY and open when they have something in them
 * (`defaultOpen={openIfPresent(count)}`), so a flow must not assume either. The
 * header is the toggle; pressing it when it is already open would close it.
 */
async function openPanel(page: import('@playwright/test').Page, tour: string, label: string): Promise<void> {
  const panel = page.locator(`[data-tour="${tour}"]`);
  await panel.scrollIntoViewIfNeeded();
  const input = panel.locator('input').first();
  if (await input.isVisible().catch(() => false)) return;
  await panel.locator('button').filter({ hasText: label }).first().click();
  await page.waitForTimeout(700);
}
