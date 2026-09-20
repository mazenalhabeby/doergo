/**
 * "People who do not work for you" — video 19.
 *
 * ⚠️ EXTERNAL IS A FACT ABOUT THE RELATIONSHIP, not a permission left off.
 * `@DenyExternal()` closes the organisation's own property to them whatever
 * their role grants, they hold no clock, no leave and no personnel file, and
 * their authority is one SPACE role — an org-wide one is refused, because it
 * would reach every workspace.
 *
 * ⚠️ THE SEED PROVIDES ONE. Without a real external member on the roster the
 * beats about what they never get have no screen — a member page with no
 * Attendance and no Time Off tab is the evidence, and it only exists if
 * somebody is actually external.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { OUTSIDER } from '../../demo-data.ts';
import { openStage } from '../runner.ts';
import { DIALOG, goTo, openTab, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function capturePeopleOutside(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'people-outside' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'members', '[data-tour="members-search"]');
  await stage.hold(0.8);

  await stage.beat('notEverybody', async () => {
    await stage.moveTo(`text=${OUTSIDER.lastName}`);
    await stage.hold(1.8);
  });

  await stage.beat('markThem', async () => {
    await stage.click('[data-tour="members-invite"]');
    await page.locator(DIALOG).waitFor({ state: 'visible', timeout: 20_000 });
    /*
      Held to the end of the beat and closed last: a frame sampled late must
      still find the dialog, because the sentence is about the choice made in
      it. Closing early leaves the narration over the list behind.
    */
    await stage.moveTo(`${DIALOG} :text("External")`);
    await stage.hold(3.2);
    await page.keyboard.press('Escape');
  });

  await stage.beat('oneRoleOnly', async () => {
    await stage.click(`button:has-text("${OUTSIDER.firstName} ${OUTSIDER.lastName}")`);
    await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(1.8);
  });

  await stage.beat('watchOrRaise', async () => {
    await openTab(stage, page, '[data-tour="access-tab"]', 'text=Platform access');
    await wheel(page, 240);
  });

  await stage.beat('noClock', async () => {
    /*
      The evidence is what is NOT on this page: no Attendance tab, no Time Off.
      The cursor runs along the tabs that are there.
    */
    await wheel(page, -240);
    await stage.moveTo('[role="tab"]:has-text("Overview")');
    await stage.hold(2.0);
  });

  await stage.beat('andTheKit', async () => {
    await wheel(page, 200);
    await stage.hold(1.8);
  });

  await stage.beat('whereNext', async () => {
    await stage.hold(1.4);
  });

  return stage.finish();
}
