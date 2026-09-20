/**
 * "Keeping a client warm" — video 22.
 *
 * The client record's own working half: what was said, where the client
 * stands, and what is scheduled next.
 *
 * ⚠️ THE STAGE CONTROL IS THE BUTTON IN THE HEADER that reads the client's
 * current stage — "Customer", "Qualified" — not a field in a form. Moving it
 * is a real write against the seeded organisation, which is rebuilt on every
 * render.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const CLIENT = 'Castlemere Schools Trust';
const NOTE = 'Rang Gregor about the fire damper survey — wants it in the October half-term, not before.';

export async function captureKeepingAClientWarm(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'keeping-a-client-warm' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.click('a[href="/clients"]');
  await page.waitForURL(/\/clients/, { timeout: 30_000 });
  await stage.click(`text=${CLIENT}`);
  await page.waitForURL(/\/customers\/[^/]+/, { timeout: 20_000 });
  await page.getByText('Activity', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await stage.hold(0.8);

  await stage.beat('whatWasSaid', async () => {
    await stage.moveTo('text=/^Activity/');
    await stage.hold(1.8);
  });

  await stage.beat('addOne', async () => {
    const box = page.locator('textarea').first();
    await box.click();
    await typeSlowly(box, NOTE);
    /*
      ⚠️ THERE ARE THREE "Add" BUTTONS ON THIS RECORD — contact people,
      addresses, and the note box. The note's is the LAST of them, which is a
      weaker rule than scoping to its own block would be, except that scoping
      by `div:has(textarea)` does not work here: the button is not inside the
      textarea's own container.
    */
    /*
      ⚠️ `button:visible`. `.last()` does not mean "the last one you can see" —
      there are further Add buttons in dialogs that have never been opened, and
      the locator lands on one of those and then waits for it to scroll into
      view, which it never will.
    */
    /*
      ⚠️ `/^\s*Add\s*$/`, NOT `/^Add$/`. A regex in `hasText` is tested against
      the element's raw text, and a button with an icon carries newlines and
      indentation around its word — so an anchored pattern matches nothing
      while the button is plainly on screen and in a list of visible buttons.
    */
    const add = page.locator('button:visible').filter({ hasText: /^\s*Add\s*$/ }).last();
    if (!(await add.isVisible().catch(() => false))) {
      const seen = await page.locator('button:visible').allTextContents();
      throw new Error(`No note button. Visible buttons: ${JSON.stringify(seen.map((t) => t.trim()).filter(Boolean).slice(0, 25))}`);
    }
    await add.scrollIntoViewIfNeeded();
    await stage.click(add);
    /*
      The note appearing in the trail is the signal the server took it — a
      textarea that still holds the text has not saved anything.
    */
    await page.getByText('October half-term', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.0);
  });

  await stage.beat('whereItStands', async () => {
    await stage.moveTo('button:has-text("Qualified"), button:has-text("Customer")');
    await stage.hold(1.8);
  });

  await stage.beat('moveIt', async () => {
    await stage.click('button:has-text("Qualified"), button:has-text("Customer")');
    const option = page.getByRole('menuitem').first();
    if (await option.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await stage.hold(1.2);
      await page.keyboard.press('Escape');
    }
    await stage.hold(1.0);
  });

  await stage.beat('theWholeStory', async () => {
    await wheel(page, 300);
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 240);
    await stage.hold(1.2);
  });

  return stage.finish();
}
