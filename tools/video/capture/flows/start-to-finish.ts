/**
 * "A job from start to finish" — video 07.
 *
 * One job walked forward a step at a time, then a finished one opened for its
 * write-up.
 *
 * ⚠️ NO STATUS IS EVER SPOKEN, and none is matched by name either. The steps
 * come from the workspace's own workflow and an organisation renames them, so
 * the forward move is "the header button that is not a cancellation, an edit
 * or the title" — the same rule the narration follows by describing what each
 * step IS rather than what it is called.
 *
 * ⚠️ IT DOES NOT COMPLETE A JOB. Finishing asks for a write-up, which is the
 * field worker's screen and a video of its own; the report shown here is the
 * one the seed furnishes on a job somebody finished yesterday
 * (`seedOneJobInFull`). Narrating a signature over a job with none is the
 * defect this pipeline produces most.
 */

import type { Page } from '@playwright/test';
import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { goTo, reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** Seeded, and already accepted — so there is a forward step to take. */
const IN_FLIGHT = 'Loading bay door will not close';
/** Seeded complete, with hours, parts and two signatures. */
const FINISHED = 'Replace failed extract fan';
const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';

export async function captureStartToFinish(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'start-to-finish' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });
  await openJob(page, IN_FLIGHT);
  await stage.hold(0.8);

  await stage.beat('theSteps', async () => {
    await stage.moveTo('[data-tour="task-progress"]');
    await stage.hold(1.8);
  });

  await stage.beat('whoMovesIt', async () => {
    await stage.moveTo(forward(page));
    await stage.hold(1.4);
  });

  await stage.beat('settingOff', async () => {
    await advance(stage, page);
    await stage.hold(1.2);
  });

  await stage.beat('arriving', async () => {
    await advance(stage, page);
    await stage.hold(1.2);
  });

  await stage.beat('working', async () => {
    await advance(stage, page);
    await reveal(page, '[data-tour="task-progress"]', 1.4);
  });

  await stage.beat('theWriteUp', async () => {
    await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
    await openJob(page, FINISHED);
    await reveal(page, '[data-tour="task-service-report"]', 1.4);
  });

  await stage.beat('whatItHolds', async () => {
    await wheel(page, 320);
    await stage.hold(1.2);
    await wheel(page, 320);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 300);
    await stage.hold(1.2);
  });

  return stage.finish();
}

/**
 * The one forward step this job offers.
 *
 * Matched by what it is NOT: the title is a button, so is Edit, so is the
 * overflow menu, and a cancellation is a step the narration never takes.
 */
function forward(page: Page) {
  return page
    .locator('[data-tour="task-header"] button')
    .filter({ hasText: /\w/ })
    .filter({ hasNotText: /cancel|edit|delete|close|block/i })
    .last();
}

async function advance(
  stage: { click(target: ReturnType<typeof forward>): Promise<void> },
  page: Page,
): Promise<void> {
  const button = forward(page);
  const was = (await button.innerText()).trim();
  await stage.click(button);
  /*
    The label changing is the signal the server took it. Waiting on a fixed
    delay here would film the next sentence over a step that had not moved.
  */
  await page.waitForFunction(
    (previous) => {
      const buttons = Array.from(
        document.querySelectorAll('[data-tour="task-header"] button'),
      ).map((b) => (b.textContent || '').trim());
      return !buttons.includes(previous);
    },
    was,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(600);
}

/** Open a job from the board, around the drag sensor that eats plain clicks. */
async function openJob(page: Page, title: string): Promise<void> {
  const link = page.getByText(title, { exact: false }).first()
    .locator('xpath=ancestor-or-self::a').first();
  await link.waitFor({ state: 'visible', timeout: 45_000 });
  const href = await link.getAttribute('href');
  await link.click();
  await page.waitForURL(/\/tasks\/[^/]+$/, { timeout: 8_000 }).catch(async () => {
    if (href) await page.goto(`${WEB_URL}${href}`, { waitUntil: 'domcontentloaded' });
  });
  await page.locator('[data-tour="task-header"]').waitFor({ state: 'visible', timeout: 30_000 });
}
