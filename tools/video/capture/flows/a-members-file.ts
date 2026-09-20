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
    /*
      ⚠️ ONE MARKER, and a text one — a comma list mixing a CSS selector with a
      text engine is not a selector Playwright reads the way it looks. Each tab
      here is proved by the heading only its own panel renders.
    */
    await openTab(stage, page, '[role="tab"]:has-text("Tasks")', 'text=Task History');
    await stage.hold(1.6);
  });

  await stage.beat('theirHours', async () => {
    await openTab(stage, page, '[role="tab"]:has-text("Attendance")', 'text=Attendance History');
    await wheel(page, 200);
  });

  await stage.beat('whereTheyWork', async () => {
    await openTab(stage, page, '[role="tab"]:has-text("Locations")', 'text=Location Assignments');
    await stage.hold(1.6);
  });

  await stage.beat('whatTheyHold', async () => {
    await openTab(stage, page, '[role="tab"]:has-text("Custody")', 'text=/HOLDING NOW/i');
    await stage.hold(1.6);
  });

  await stage.beat('andThePaperwork', async () => {
    /*
      ⚠️ THERE IS NO DOCUMENTS TAB ON A MEMBER. The personnel file is its own
      screen; what sits here is Time Off, which is the other thing that passes
      between a member and the office. The narration says "the paperwork
      between you", which is true of a leave record and would have been false
      of a tab that does not exist.
    */
    await openTab(stage, page, '[role="tab"]:has-text("Time Off")', 'text=/Manage time-off requests/i');
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
