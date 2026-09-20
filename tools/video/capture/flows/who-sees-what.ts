/**
 * "Who sees what" — video 04.
 *
 * The role system, as a person meets it: the column on the members list, the
 * roles behind it, what one contains, and what happens when you add to it.
 *
 * ⚠️ THE ROLES DIALOG IS TWO SCREENS IN ONE. The list and the editor swap
 * inside the same `[role="dialog"]`, so "the dialog is visible" is never
 * enough of a wait — every beat here waits for something only its own screen
 * has.
 *
 * ⚠️ IT WRITES. One permission is added to a real role and saved, because the
 * narration says everybody holding it gains it and a video that only mimed
 * that would be describing a feature rather than showing one.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, goTo, openTab, scrollBy, signIn, typeSlowly } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** The organisation's own role, seeded — see createAccessRoles in seed-video.ts. */
const OWN_ROLE = 'Field Engineer';

export async function captureWhoSeesWhat(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'who-sees-what' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'members', '[data-tour="members-search"]');
  await page.getByText(OWN_ROLE).first().waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('everyoneHasOne', async () => {
    await stage.moveTo(`text=${OWN_ROLE}`);
    await scrollBy(page, 260);
  });

  await stage.beat('theRoles', async () => {
    /*
      ⚠️ `:text-is`, NOT `:has-text`. `has-text` is a SUBSTRING match, and the
      role FILTER beside this button reads "All Roles" — so `has-text("Roles")`
      opens the filter's listbox instead, and the beat then waits thirty
      seconds for a dialog nobody opened.
    */
    await stage.click('button:text-is("Roles")');
    // The LIST screen, not merely the dialog: the editor lives in the same one.
    await page.locator(`${DIALOG} button:has-text("New role")`)
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.4);
  });

  await stage.beat('someAreOurs', async () => {
    await stage.moveTo(`${DIALOG} :text("Built-in")`);
    await stage.hold(1.2);
  });

  await stage.beat('insideOne', async () => {
    /*
      The row carries the role's name; the pencil beside it opens the editor.
      Matched by relation rather than by index — the list grows as an
      organisation writes its own, and an indexed selector edits a stranger.
    */
    const row = page.locator(`${DIALOG} div.rounded-xl`).filter({ hasText: OWN_ROLE }).first();
    await stage.click(row.locator('button').first());
    await page.locator(`${DIALOG} :text("Permissions")`).waitFor({ state: 'visible', timeout: 20_000 });
    await stage.hold(1.0);
    await scrollBy(page, 220);
  });

  await stage.beat('oneMoreThing', async () => {
    /*
      ⚠️ NAMED, and the first version was not — it ticked "the first unticked
      box", which turned out to be *view all tasks*. That is the one permission
      on this screen with a side effect: it also means "read every client", and
      it puts an amber warning on the member's own page saying they now see
      every workspace regardless — under a narration that had just said where
      somebody works is decided by the workspaces they are put in. The video
      contradicted itself because the selector was picked for convenience.

      Reading is harmless, so reading is what this adds. English text is safe
      here: the recording account renders in English, like every frame.
    */
    const unticked = page
      .locator(`${DIALOG} label:has(button[role="checkbox"][data-state="unchecked"])`)
      .filter({ hasText: 'View reports' })
      .first();
    await unticked.scrollIntoViewIfNeeded();
    await stage.moveTo(unticked);
    await unticked.click();
    await page.waitForTimeout(700);
    await stage.click(`${DIALOG} button:has-text("Save")`);
    // Back on the list is the signal the server took it.
    await page.locator(`${DIALOG} button:has-text("New role")`)
      .waitFor({ state: 'visible', timeout: 30_000 });
  });

  await stage.beat('orYourOwn', async () => {
    await stage.click(`${DIALOG} button:has-text("New role")`);
    const name = page.locator(`${DIALOG} input`).first();
    await name.waitFor({ state: 'visible', timeout: 20_000 });
    await name.click();
    await typeSlowly(name, 'Yard Supervisor');
    // Held long, then cancelled at the very end: the beat is ABOUT the editor,
    // and a frame sampled late must still find it on screen.
    await stage.hold(2.8);
    // Left unsaved on purpose: the beat is about writing one, and a half-built
    // role saved here would sit in the organisation for every later video.
    await stage.click(`${DIALOG} button:has-text("Cancel")`);
    await page.locator(`${DIALOG} button:has-text("New role")`)
      .waitFor({ state: 'visible', timeout: 20_000 });
  });

  /*
    ⚠️ THERE IS NO BEAT HERE ABOUT EXTERNAL PEOPLE, and there was one until it
    was filmed. This dialog lists ORG-scoped roles only — it says so in its own
    subtitle — and the two built-in external roles are SPACE-scoped, so they
    are not on this screen at all. The sentence was true of the product and
    false of the picture. Video 19 carries it, where those roles are actually
    granted.
  */
  await stage.beat('whereItApplies', async () => {
    await stage.click(`${DIALOG} button:has-text("Close")`);
    await page.locator(DIALOG).waitFor({ state: 'hidden', timeout: 20_000 });
    await stage.click(`button:has-text("Priya Rhodes")`);
    await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
    await openTab(stage, page, '[data-tour="access-tab"]', 'text=Platform access');
    await page.waitForTimeout(600);
    await scrollBy(page, 320);
  });

  await stage.beat('whereNext', async () => {
    await scrollBy(page, 240);
    await stage.hold(1.0);
  });

  return stage.finish();
}
