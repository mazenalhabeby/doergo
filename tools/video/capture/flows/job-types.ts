/**
 * "Job types that fit your trade" — video 08.
 *
 * The board's columns, then the thing behind them: the workspace's task type,
 * the library it can be taken from, and what happens to jobs already out.
 *
 * ⚠️ NOTHING IS APPLIED. The library dropdown is opened and closed again, and
 * "Re-sync existing tasks" is pointed at, never pressed. Both would rewrite the
 * workspace every later beat is filmed against — and re-sync moves every job on
 * the board onto different columns, which is a change to fourteen records to
 * illustrate one sentence.
 *
 * ⚠️ THE WORKFLOW TAB IS AN OPTION. It renders only where the organisation has
 * bought workflows; the seed grants every option, so it is here. In an
 * organisation without it the tab is hidden and this video has no subject.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { DEPOT } from '../../demo-data.ts';
import { openStage } from '../runner.ts';
import { goTo, reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';

export async function captureJobTypes(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'job-types' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('notAllTheSame', async () => {
    await stage.moveTo(BOARD);
    await wheel(page, 200);
    await wheel(page, -200);
  });

  await stage.beat('theTypeBehindIt', async () => {
    /*
      ⚠️ Reached by URL, and this is the one place in the library where that is
      right: the workflow tab is inside a workspace's settings, three clicks
      and two menus deep, and none of those clicks is what the sentence is
      about. The app is already loaded, so this is a client-side visit with no
      re-boot — unlike the hard `goto` the other flows avoid.
    */
    await page.goto(`${WEB_URL}/locations/${DEPOT.id}?tab=workflow`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Task types in this workspace').first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(1.4);
  });

  await stage.beat('readIt', async () => {
    // The steps, written out as one line with arrows between them.
    await stage.moveTo('text=/Assigned.*Accepted.*Completed/');
    await stage.hold(1.8);
  });

  await stage.beat('theLibrary', async () => {
    const library = page.locator('button[role="combobox"]').filter({ hasText: /library/i }).first();
    await library.scrollIntoViewIfNeeded();
    await stage.click(library);
    await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 20_000 });
    await stage.hold(1.8);
  });

  await stage.beat('yourOwnCopy', async () => {
    /*
      Closed with Escape rather than by choosing: picking a template from the
      library and pressing "Use template" replaces this workspace's task type
      for real. The sentence is about what you GET, and the copy notice beside
      the control says it in the product's own words.
    */
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await stage.moveTo('text=/You get your own copy/');
    await stage.hold(1.6);
  });

  await stage.beat('orBuildOne', async () => {
    /*
      ⚠️ "Select workflow…" is NOT a combobox — the tab has exactly one of
      those, the library. The way to a blank one is the button beside it, and
      the first cut of this beat spent 45 seconds waiting for a control that
      does not exist in that shape.
    */
    const create = page.locator('button').filter({ hasText: /Create New/i }).first();
    await create.scrollIntoViewIfNeeded();
    await stage.moveTo(create);
    await stage.hold(2.0);
  });

  await stage.beat('theJobsAlreadyOut', async () => {
    await reveal(page, 'text=/Re-sync existing tasks/', 0.6);
    await stage.moveTo('text=/Re-sync existing tasks/');
    await stage.hold(2.0);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
