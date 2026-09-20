/**
 * "A member's file" — video 18, for `memberDetailTour`.
 *
 * One person, tab by tab. Read-only from end to end: every tab here is
 * somebody's real record, and a stray click on Access or Time Off would change
 * the organisation every later video is filmed against.
 *
 * ⚠️ A TAB TRIGGER IS VISIBLE WHETHER OR NOT ITS PANEL OPENED, so each tab is
 * proved by something only its own panel has — see openTab.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { goTo, openTab, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** On the rota, holds a van, and has jobs — so every tab has something in it. */
const MEMBER = 'Priya Rhodes';

export async function captureAMembersFile(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'a-members-file' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'members', '[data-tour="members-search"]');
  await stage.click(`button:has-text("${MEMBER}")`);
  await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('onePerson', async () => {
    await stage.moveTo('[data-tour="page-member"]');
    await stage.hold(1.8);
  });

  await stage.beat('whatTheyReach', async () => {
    await openTab(stage, page, '[data-tour="access-tab"]', 'text=Platform access');
    await wheel(page, 220);
  });

  await stage.beat('theirWork', async () => {
    await openTab(stage, page, '[role="tab"]:has-text("Tasks")', 'table, text=/No tasks/i');
    await stage.hold(1.6);
  });

  await stage.beat('theirHours', async () => {
    await openTab(stage, page, '[role="tab"]:has-text("Attendance")', 'text=/Attendance History/i');
    await wheel(page, 200);
  });

  await stage.beat('whereTheyWork', async () => {
    await openTab(stage, page, '[role="tab"]:has-text("Locations")', 'text=/Halstead|Brambleside|Kesterton/');
    await stage.hold(1.6);
  });

  await stage.beat('whatTheyHold', async () => {
    await openTab(stage, page, '[role="tab"]:has-text("Custody")', 'text=/Van|holds|nothing/i');
    await stage.hold(1.6);
  });

  await stage.beat('andThePaperwork', async () => {
    /*
      The documents tab is named differently depending on what the
      organisation calls it; matched on either, and the panel is proved by
      anything the panel itself renders.
    */
    await openTab(stage, page, '[role="tab"]:has-text("Documents"), [role="tab"]:has-text("Time Off")', 'text=/Document|Time Off/i');
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
