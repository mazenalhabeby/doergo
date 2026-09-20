/**
 * "Workspaces" — video 03, for `spacesTour`.
 *
 * The list, then one made from nothing: a name, a kind, a place on the map,
 * what it is allowed to do, and the steps a job takes there.
 *
 * ⚠️ THIS FLOW WRITES. It creates a workspace, which costs money on a real
 * bill and cannot be undone from the UI. Fine against the seeded organisation,
 * which is rebuilt on every render — but never run it with `--skip-seed` twice
 * expecting the same screen, because the second run starts with the first
 * run's workspace already there.
 *
 * ⚠️ The modules section is COLLAPSED in the create form (`showAdvanced`).
 * Reaching for a toggle inside it waits the full timeout for an element that
 * was never in the DOM.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, goTo, reveal, scrollBy, signIn, spaceCard, typeSlowly } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** Invented, like everything else in this organisation. */
const NEW_SPACE = 'Thameside Yard';
const NEW_ADDRESS = 'Thameside Yard, Slough SL3';

export async function captureWorkspaces(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'workspaces' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'spaces', '[data-tour="spaces-card"]');
  await stage.hold(0.8);

  await stage.beat('theList', async () => {
    await stage.moveTo('[data-tour="spaces-intro"]');
    await scrollBy(page, 220);
  });

  await stage.beat('whatACardSays', async () => {
    // The depot rather than the first card: the list does not order by default,
    // so an indexed selector points at whichever workspace sorts first.
    await stage.moveTo(spaceCard(page, 'Halstead Depot'));
    await stage.hold(1.2);
  });

  await stage.beat('newOne', async () => {
    await stage.click('[data-tour="spaces-create"]');
    await page.locator(DIALOG).waitFor({ state: 'visible' });
    await page.locator('[data-tour="spaces-dialog-name"]').waitFor({ state: 'visible' });
    await stage.type('[data-tour="spaces-dialog-name"]', NEW_SPACE);
    await reveal(page, '[data-tour="spaces-form-type"]', 0.8);
    /*
      ⚠️ CLICKED, not merely pointed at. The address, map and boundary section
      is mounted ONLY when the kind is "physical" — resting the cursor on the
      choice without taking it leaves the next beat waiting 20 seconds for a
      section that was never going to exist. That is how this failed first.
    */
    await stage.click('[data-tour="spaces-form-type-physical"]');
    await page.waitForTimeout(600);
    await stage.moveTo('[data-tour="spaces-form-ownership"]');
  });

  await stage.beat('whereItIs', async () => {
    await reveal(page, '[data-tour="spaces-form-physical"]', 0.5);
    const address = page.locator('#space-address');
    await address.click();
    await typeSlowly(address, NEW_ADDRESS);
    await stage.hold(1.4);
  });

  await stage.beat('whatItCanDo', async () => {
    /*
      ⚠️ The modules live behind "advanced" and are NOT mounted until it is
      opened. The section's own header is the toggle.
    */
    const section = '[data-tour="spaces-form-modules"]';
    await reveal(page, section, 0.4);
    await page.locator(`${section} button`).first().click();
    await page.waitForTimeout(800);
    await scrollBy(page, 180);
    await stage.hold(1.0);
  });

  await stage.beat('onlyWhatYouNeed', async () => {
    /*
      ⚠️ Switched by CAPABILITY, never by label read aloud. The narration says
      "nothing that travels"; which switch carries that today is the product's
      business, and an organisation may rename it tomorrow.
    */
    /*
      ⚠️ `#space-module-<key>`, NOT `#module-<key>`. The workspace SETTINGS tab
      and the CREATE form list the same modules under different ids, and the
      wrong one matches nothing — which, wrapped in a visibility check, is a
      beat that silently does nothing while the narration says a switch was
      thrown. Checked here with a click that must land.
    */
    const travels = page.locator(`${DIALOG} label:has(#space-module-tracking)`).first();
    await travels.scrollIntoViewIfNeeded();
    await stage.moveTo(travels);
    await travels.click();
    await page.waitForTimeout(700);
    await stage.hold(0.8);
  });

  await stage.beat('theSteps', async () => {
    /*
      The workflow is what this beat is ABOUT, so it is held first and the save
      comes at the end. Saving first left the beat's own frame on the list page
      with a toast — a shot of the previous sentence's subject.
    */
    await reveal(page, '[data-tour="spaces-form-workflow"]', 0.6);
    await stage.moveTo('[data-tour="spaces-form-workflow"]');
    await stage.hold(2.2);
    await stage.click('[data-tour="spaces-form-submit"]');
    /*
      The dialog closing is the only honest signal the server took it — a
      refused field leaves it open with a message, and a flow that pressed on
      would film the next beat over a dialog nobody dismissed.
    */
    await page.locator(DIALOG).waitFor({ state: 'hidden', timeout: 30_000 });
    await page.getByText(NEW_SPACE, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
  });

  await stage.beat('theDefault', async () => {
    await stage.moveTo(spaceCard(page, 'Halstead Depot'));
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await scrollBy(page, 200);
    await stage.hold(1.0);
  });

  return stage.finish();
}
