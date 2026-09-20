/**
 * "The road actually driven" — video 34.
 *
 * ⚠️ RE-SCOPED FROM "a live map of everybody". There is no such screen in this
 * build — the tracking tab on the attendance board is a table of who is
 * clocked in — and narrating one over a list of times is the defect this whole
 * pipeline exists to catch. What DOES exist, and is the stronger half anyway,
 * is the road one member drove to one job.
 *
 * ⚠️ IT NEEDS GPS IN THE SEED. The section mounts when the task has points or
 * is on the way; with neither it renders "waiting for the technician", and a
 * video about a road has a spinner to narrate over. `seedRoute` lays down
 * twenty-six points along a driven path — not two, because "not a straight
 * line between two pins" is the entire claim.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { goTo, reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** Seeded EN_ROUTE, with a route under it. */
const JOB = 'Cold room 2';
const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';

export async function captureWhereEveryoneIs(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'where-everyone-is' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });

  const link = page.getByText(JOB, { exact: false }).first()
    .locator('xpath=ancestor-or-self::a').first();
  const href = await link.getAttribute('href');
  await page.goto(`${WEB_URL}${href}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-tour="task-header"]').waitFor({ state: 'visible', timeout: 45_000 });
  /*
    The map is drawn once the points arrive and then snapped to roads, so the
    section existing is not enough — wait for it, then let it settle.
  */
  await page.locator('[data-tour="task-route-tracking"]')
    .waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(1.2);

  await stage.beat('theMap', async () => {
    await stage.moveTo('[data-tour="task-header"]');
    await stage.hold(1.8);
  });

  await stage.beat('theQuestion', async () => {
    await reveal(page, '[data-tour="task-route-tracking"]', 2.2);
  });

  await stage.beat('theRoute', async () => {
    await stage.hold(2.4);
  });

  await stage.beat('distanceAndTime', async () => {
    await wheel(page, 200);
    await stage.hold(2.0);
  });

  await stage.beat('notAllDay', async () => {
    await stage.moveTo('[data-tour="task-progress"]');
    await stage.hold(2.0);
  });

  await stage.beat('whereNext', async () => {
    await goTo(stage, page, 'dashboard', '[data-tour="dash-spaces"]');
    /*
      ⚠️ THE GUIDED TOUR CAN OPEN ON THE DASHBOARD and sit over the shot — it
      did on the first take of this beat. Dismissed rather than waited out: it
      is a first-run prompt for a real customer, and correct there.
    */
    const skip = page.locator('button:visible').filter({ hasText: /Skip|Close|Got it|✕/i }).first();
    if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(600);
    }
    await stage.moveTo('[data-tour="dash-spaces"]');
    await stage.hold(1.6);
  });

  return stage.finish();
}
