/**
 * "Build a report" — video 33, for `reportsTour`.
 *
 * ⚠️ THE DATASET, THE BREAKDOWN AND THE PERIOD ARE THREE SEPARATE CHOICES and
 * the run button does nothing useful until the first is made. Each beat here
 * makes one of them, in the order the screen asks.
 *
 * ⚠️ NEVER NARRATE A COLUMN NAME. Report column labels are translated, and an
 * organisation's own field names are not — a sentence naming one is wrong in
 * four languages out of five.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureBuildAReport(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'build-a-report' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/reports`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-tour="reports-dataset"], [data-tour="reports-header"]').first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('theQuestion', async () => {
    await stage.moveTo('[data-tour="reports-dataset"]');
    await stage.hold(1.8);
  });

  await stage.beat('cutItUp', async () => {
    await stage.moveTo('[data-tour="reports-dimensions"]');
    await stage.hold(1.8);
  });

  await stage.beat('overWhat', async () => {
    await stage.moveTo('[data-tour="reports-period"]');
    await stage.hold(1.6);
  });

  await stage.beat('runIt', async () => {
    await stage.click('[data-tour="reports-run"]');
    await page.locator('[data-tour="reports-results"]')
      .waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(1.6);
  });

  await stage.beat('takeItAway', async () => {
    await stage.moveTo('[data-tour="reports-export"]');
    await stage.hold(1.4);
    await stage.moveTo('[data-tour="reports-save"]');
    await stage.hold(1.4);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
