/**
 * "A role of your own" — video 17, for `membersTour`.
 *
 * Video 04 explains what a role IS. This one writes one, from nothing, and
 * hands it to somebody — the practical half.
 *
 * ⚠️ IT WRITES. A role is created and assigned for real, because the sentence
 * is that everybody holding it changes with it, and a video that mimed the
 * save would be describing the feature rather than showing it.
 *
 * ⚠️ `:text-is("Roles")`, not `:has-text` — the filter beside the button reads
 * "All Roles", and a substring match opens that instead.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, goTo, openTab, pickFromSelect, signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const ROLE = 'Yard Supervisor';
const HOLDER = 'Samuel Whitlock';

export async function captureARoleOfYourOwn(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'a-role-of-your-own' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'members', '[data-tour="members-search"]');
  await stage.hold(0.8);

  await stage.beat('theJobWithNoRole', async () => {
    await stage.click('button:text-is("Roles")');
    await page.locator(`${DIALOG} button:has-text("New role")`)
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.6);
  });

  await stage.beat('nameIt', async () => {
    await stage.click(`${DIALOG} button:has-text("New role")`);
    const name = page.locator(`${DIALOG} input`).first();
    await name.waitFor({ state: 'visible', timeout: 20_000 });
    await name.click();
    await typeSlowly(name, ROLE);
    await stage.hold(1.0);
  });

  await stage.beat('tickWhatItDoes', async () => {
    /*
      Two ticks, both harmless and both named — see the note in video 04 about
      what happens when a permission is chosen for convenience rather than for
      what it means.
    */
    for (const label of ['View all tasks', 'View reports']) {
      const box = page
        .locator(`${DIALOG} label:has(button[role="checkbox"][data-state="unchecked"])`)
        .filter({ hasText: label })
        .first();
      if (await box.isVisible().catch(() => false)) {
        await box.scrollIntoViewIfNeeded();
        await stage.moveTo(box);
        await box.click();
        await page.waitForTimeout(500);
      }
    }
    await stage.hold(1.0);
  });

  await stage.beat('saveIt', async () => {
    await stage.click(`${DIALOG} button:has-text("Create")`);
    await page.locator(`${DIALOG} button:has-text("New role")`)
      .waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByText(ROLE, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 20_000 });
    await stage.hold(1.6);
  });

  await stage.beat('giveItToSomebody', async () => {
    await stage.click(`${DIALOG} button:has-text("Close")`);
    await page.locator(DIALOG).waitFor({ state: 'hidden', timeout: 20_000 });
    await stage.click(`button:has-text("${HOLDER}")`);
    await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
    await openTab(stage, page, '[data-tour="access-tab"]', 'text=Platform access');
    /*
      ⚠️ THE ROLE HAS TO ACTUALLY CHANGE. The first cut opened the tab and
      stopped, so the sentence "what they can reach changes at once" played
      over a member still holding the role they arrived with.
    */
    await pickFromSelect(page, /Field Engineer|Member|Role/i, ROLE, 'body');
    await page.waitForTimeout(600);
    const save = page.locator('button:visible').filter({ hasText: /^\s*Save\s*$/ }).first();
    if (await save.isVisible().catch(() => false)) {
      await stage.click(save);
      await page.waitForTimeout(1_800);
    }
    await stage.hold(1.2);
  });

  await stage.beat('andEverybodyElse', async () => {
    await wheel(page, 240);
    await stage.hold(1.8);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
