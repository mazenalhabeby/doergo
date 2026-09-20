/**
 * "Who has the van" — video 25.
 *
 * ⚠️ THE HOLDER IS NEVER WRITTEN ONTO A COST. Every entry carries the date the
 * money moved; who held the thing that day is a lookup. That is the sentence
 * the last beat makes, and it is only true because of how the data is stored —
 * so the video says it over the ledger rather than over a diagram.
 *
 * ⚠️ THE TABS CARRY COUNTS. "Money 4", "Custody 1" — an anchored text match
 * finds neither.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const VEHICLE = 'Van 1';

export async function captureWhoHasTheVan(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'who-has-the-van' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.click('a[href="/assets"]');
  await page.waitForURL(/\/assets/, { timeout: 30_000 });
  await stage.click(`a[href^="/assets/"]:has-text("${VEHICLE}")`);
  await page.waitForURL(/\/assets\/[^/]+$/, { timeout: 20_000 });
  await page.getByText('DETAILS', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await stage.hold(0.8);

  await stage.beat('aThingWithAHistory', async () => {
    await stage.moveTo('text=/Registration/');
    await stage.hold(1.6);
  });

  await stage.beat('whoHasItNow', async () => {
    await stage.moveTo('text=/DRIVER/i');
    await stage.hold(1.8);
  });

  await stage.beat('andWhoHadIt', async () => {
    await stage.click('text=/Custody/');
    await page.waitForTimeout(1600);
    await stage.hold(1.6);
  });

  await stage.beat('whatItCost', async () => {
    await wheel(page, 200);
    await stage.hold(1.8);
  });

  await stage.beat('handItOver', async () => {
    /*
      The handover dialog renders the plan before anybody agrees to it —
      which custody closes, which opens. It is opened and closed again: the
      sentence is about being told first, and actually moving the van would
      change what every later beat is filmed against.
    */
    /*
      ⚠️ "Hand it over" — three words, not "Hand over". The first cut matched
      neither and simply held on the previous screen while the narration
      described a dialog nobody opened.
    */
    const hand = page.locator('button:visible').filter({ hasText: /Hand it over/i }).first();
    if (await hand.isVisible().catch(() => false)) {
      await stage.click(hand);
      await page.waitForTimeout(1400);
      await stage.hold(1.6);
      await page.keyboard.press('Escape');
    } else {
      await stage.hold(2.0);
    }
  });

  await stage.beat('theLedgerFollows', async () => {
    await stage.click('text=/Money/');
    await page.waitForTimeout(1600);
    await wheel(page, 180);
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await stage.hold(1.4);
  });

  return stage.finish();
}
