/**
 * "Overtime, asked and approved" — video 13, for `pageOvertime`.
 *
 * ⚠️ IT APPROVES A REAL REQUEST. The seed leaves one round waiting
 * (`seedRota`), and this flow says yes to it — because the sentence is that
 * approving MOVES the shift's end, and a video that mimed the click would be
 * describing the feature rather than showing it.
 *
 * ⚠️ ONE ROW PER ROUND. `OvertimeRequest.timeEntryId` used to be unique, so a
 * shift could hold one request ever while the flow already looped. Do not
 * assume a member has at most one.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { goTo, openTab, reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureOvertime(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'overtime' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/overtime`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Overtime', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByText('Needs Approval', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('theQueue', async () => {
    await stage.moveTo('text=Needs Approval');
    await stage.hold(1.6);
  });

  await stage.beat('theyGaveAReason', async () => {
    await stage.moveTo('text=/Rebuilding the pump seal/');
    await stage.hold(2.0);
  });

  await stage.beat('whatItIs', async () => {
    await stage.moveTo('text=/hours requested/');
    await stage.hold(2.0);
  });

  await stage.beat('youDecide', async () => {
    await stage.click('button:has-text("Approve")');
    /*
      Approving may ask for a signature or a note before it commits. Both are
      correct; the flow waits for whichever arrives and completes it, rather
      than assuming the click was the end of it.
    */
    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await stage.hold(1.2);
      const confirm = dialog.locator('button').filter({ hasText: /Approve|Confirm|Save/i }).last();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
    }
    await page.getByText(/approved|History/i).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.0);
  });

  await stage.beat('theHoursFollow', async () => {
    /*
      ⚠️ THE SENTENCE IS ABOUT THE SHIFT, SO THE SHIFT HAS TO BE ON SCREEN.
      This beat rested on the queue's counters at first — true, and not what
      was being said. The member's own row is where the approval shows up as a
      changed shift, so that is where the claim is made.
    */
    await goTo(stage, page, 'members', '[data-tour="members-search"]');
    await stage.click('button:has-text("Iris Nakamura")');
    await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
    await openTab(stage, page, '[role="tab"]:has-text("Attendance")', 'text=/on site/');
    await stage.hold(1.8);
  });

  await stage.beat('theRecord', async () => {
    await page.goto(`${WEB_URL}/overtime`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Overtime', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    const history = page.locator('button').filter({ hasText: /^History$/ }).first();
    if (await history.isVisible().catch(() => false)) {
      await stage.click(history);
      await page.waitForTimeout(1200);
    }
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 220);
    await stage.hold(1.2);
  });

  return stage.finish();
}
