/**
 * "The filing cabinet" — video 29.
 *
 * ⚠️ THE ORGANISATION STARTS WITH NO DOCUMENT TYPES AT ALL, and that is the
 * right place to begin: nothing can be filed until one exists, and the screen
 * says so. It offers a shelf of ready-made ones — a payslip, a contract, a
 * driving licence — which is what this video uses rather than inventing a type
 * nobody would recognise.
 *
 * ⚠️ A TYPE NAMES THE ROLES THAT MAY SEE IT, and EMPTY MEANS NO RESTRICTION,
 * not "nobody". The narration says so, because the opposite default would
 * empty every register in every organisation on the day it shipped.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureTheFilingCabinet(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'the-filing-cabinet' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/documents/types`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Document types', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('twoDirections', async () => {
    await stage.moveTo('text=/A type says what a document IS/');
    await stage.hold(2.0);
  });

  await stage.beat('kinds', async () => {
    await stage.moveTo('text=/Employment contract/');
    await stage.hold(1.4);
    await stage.moveTo('text=/Driving licence/');
    await stage.hold(1.4);
  });

  await stage.beat('whoMaySee', async () => {
    await stage.click('text=/^Payslip$/');
    await page.waitForTimeout(1_800);
    await stage.hold(1.6);
  });

  await stage.beat('leaveItOpen', async () => {
    await wheel(page, 260);
    await stage.hold(2.0);
  });

  await stage.beat('theRegister', async () => {
    const save = page.locator('button:visible').filter({ hasText: /Create|Save|Add/i }).last();
    if (await save.isVisible().catch(() => false)) {
      await stage.click(save);
      await page.waitForTimeout(2_500);
    }
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
