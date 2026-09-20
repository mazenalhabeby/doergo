/**
 * "Equipment on the books" — video 24, for `pageAssets`.
 *
 * ⚠️ THERE IS NO "ADD ASSET" ON THIS SCREEN, and the script asked for one
 * until this was filmed. The register is a register; kinds and records are
 * created elsewhere, and a beat about adding one would have been a sentence
 * over a button that is not there. It shows instead what a kind DOES: the
 * fields it makes a record carry.
 *
 * ⚠️ THE ROW'S NAME IS THE LINK. Clicking anywhere else on the row does
 * nothing at all — no navigation, no error.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const VEHICLE = 'Van 1';

export async function captureEquipmentOnTheBooks(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'equipment-on-the-books' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.click('a[href="/assets"]');
  await page.waitForURL(/\/assets/, { timeout: 30_000 });
  await page.getByText('Transit Custom', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('whatYouOwn', async () => {
    await wheel(page, 200);
    await wheel(page, -200);
  });

  await stage.beat('kinds', async () => {
    /*
      ⚠️ ONE ENGINE PER SELECTOR. A comma list mixing CSS with `text=` is not
      read the way it looks. The column header is plain text in a table head.
    */
    await stage.moveTo('text=/Test equipment/');
    await stage.hold(1.8);
  });

  await stage.beat('theKindAsks', async () => {
    await stage.click(`a[href^="/assets/"]:has-text("${VEHICLE}")`);
    await page.waitForURL(/\/assets\/[^/]+$/, { timeout: 20_000 });
    await page.getByText('DETAILS', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.4);
  });

  await stage.beat('whatTheRecordHolds', async () => {
    await stage.moveTo('text=/Registration/');
    await stage.hold(2.0);
  });

  await stage.beat('itHasALife', async () => {
    /*
      ⚠️ UNANCHORED. These tabs carry a count beside the word, so the element's
      text is "Money4" and "Custody1" — an anchored pattern matches neither.
    */
    await stage.moveTo('text=/Logbook/');
    await stage.hold(1.2);
    await stage.moveTo('text=/Money/');
    await stage.hold(1.4);
  });

  await stage.beat('whereNext', async () => {
    await stage.moveTo('text=/Custody/');
    await stage.hold(1.6);
  });

  return stage.finish();
}
