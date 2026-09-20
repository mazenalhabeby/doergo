/**
 * "Give it to somebody" — video 06, for `taskDetailTour`.
 *
 * The seeded job that nobody is on, handed over, and the three places that
 * change the moment it is: the job itself, its trail, and the member's page.
 *
 * ⚠️ IT NEEDS THE ONE UNASSIGNED JOB IN THE SEED. Every other job in this
 * organisation already has a name against it — see the note beside
 * `Site survey` in demo-data.ts. Rename it there and this flow opens whatever
 * card happens to match, which is how a video about assigning ends up filming
 * a job somebody is already doing.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, dialogWith, goTo, openTab, reveal, scrollBy, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const UNASSIGNED = 'Site survey — new tenant fit-out';
const TAKER = 'Priya Rhodes';
const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';

export async function captureGiveItToSomebody(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'give-it-to-somebody' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByText(UNASSIGNED, { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('nobodyOnIt', async () => {
    await stage.moveTo(`text=${UNASSIGNED}`);
    await stage.hold(1.6);
  });

  await stage.beat('openIt', async () => {
    /*
      ⚠️ THE BOARD SWALLOWS A PLAIN CLICK — the columns are drag-and-drop and
      their pointer sensor reads press-move-release as the start of a drag. The
      card's own href is the fallback.
    */
    const link = page.getByText(UNASSIGNED, { exact: false }).first()
      .locator('xpath=ancestor-or-self::a').first();
    const href = await link.getAttribute('href');
    await link.click();
    await page.waitForURL(/\/tasks\/[^/]+$/, { timeout: 8_000 }).catch(() => {});
    await page.locator('[data-tour="task-sidebar"]').waitFor({ state: 'visible', timeout: 30_000 });
    if (!/\/tasks\/[^/]+$/.test(page.url()) && href) {
      throw new Error(`The board swallowed the click and there was no href to fall back on (${href}).`);
    }
    await stage.moveTo('[data-tour="task-sidebar"]');
    await stage.hold(1.0);
  });

  await stage.beat('whoIsFree', async () => {
    await stage.click('[data-tour="task-sidebar"] button:has-text("Add")');
    const picker = dialogWith(':text("Workspace members")');
    await page.locator(picker).waitFor({ state: 'visible', timeout: 20_000 });
    await stage.hold(1.8);
  });

  await stage.beat('handedOver', async () => {
    const row = page.locator(`${DIALOG} div`).filter({ hasText: TAKER }).last();
    await stage.click(row);
    await page.waitForTimeout(500);
    await stage.click(`${DIALOG} button:has-text("Save")`);
    /*
      The chip appearing in the sidebar is the signal the server took it — the
      dialog closing only means the request was sent.
    */
    await page.locator('[data-tour="task-sidebar"]').getByText(TAKER, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.0);
  });

  await stage.beat('theTrail', async () => {
    await reveal(page, '[data-tour="task-activity"]', 1.4);
    await wheel(page, 200);
  });

  await stage.beat('theirDay', async () => {
    await goTo(stage, page, 'members', '[data-tour="members-search"]');
    await stage.click(`button:has-text("${TAKER}")`);
    await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
    /*
      ⚠️ NO TAB IS OPENED HERE, and the first cut opened one that was not
      there. The Tasks tab's panel carries no anchor of its own, so the proof
      used was the job's title — which also appears in "Recent Tasks" on the
      OVERVIEW tab, so the check passed while the tab never changed and the
      cursor sat on a trigger that had done nothing.

      The overview is the better shot anyway: the job is in their recent work
      AND in their activity, which is exactly what the sentence says.
    */
    await reveal(page, ':text("Recent Tasks")', 0.8);
    await stage.moveTo(`text=${UNASSIGNED}`);
    await scrollBy(page, 200);
  });

  await stage.beat('whereNext', async () => {
    await stage.hold(1.4);
  });

  return stage.finish();
}
