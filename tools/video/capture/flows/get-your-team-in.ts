/**
 * "Get your team in" — video 16, for `pageInvitations`.
 *
 * ⚠️ THE INVITATION CODE IS A BEARER CREDENTIAL. `Invitation` has no email
 * column: whoever types the code joins this organisation, with the role the
 * code carries. Filming a live one publishes a working key.
 *
 * So this flow REVOKES the code it creates, in the same take, and the
 * narration says why. The frames that show it are then a key to nothing — and
 * the revocation is the point of the last beat rather than a chore hidden
 * after the camera stopped.
 *
 * ⚠️ Even so, nothing here is a real organisation: the seed's org exists only
 * on this machine and is destroyed on the next render.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, dialogWith, goTo, pickFromSelect, reveal, signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureGetYourTeamIn(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'get-your-team-in' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'members', '[data-tour="members-search"]');
  await stage.hold(0.8);

  await stage.beat('whoIsHere', async () => {
    await stage.moveTo('[data-tour="members-search"]');
    await wheel(page, 240);
    await wheel(page, -240);
  });

  await stage.beat('inviteOne', async () => {
    await stage.click('[data-tour="members-invite"]');
    await page.locator(DIALOG).waitFor({ state: 'visible', timeout: 20_000 });
    /*
      ⚠️ THE DIALOG OFFERS TWO METHODS and opens on Email. This video is about
      the code — the thing you hand somebody who is standing in front of you —
      so the method is chosen first, and everything after it depends on that
      click having landed.
    */
    await stage.click(`${DIALOG} button:text-is("Code")`);
    await page.waitForTimeout(700);
    await stage.hold(1.0);
  });

  await stage.beat('decideFirst', async () => {
    /*
      Who they are, and where they land. The staff/external choice is the one
      that cannot be undone by editing a permission later — an external member
      holds no clock, no leave and no personnel file whatever else you grant.
    */
    await stage.moveTo(`${DIALOG} :text("Who is this?")`);
    await stage.hold(1.2);
    await pickFromSelect(page, /No workspace/i, 'Halstead Depot').catch(() => {});
    await stage.hold(1.2);
  });

  await stage.beat('theCode', async () => {
    await stage.click(`${DIALOG} button:has-text("Invitation"), ${DIALOG} button:has-text("Generate")`);
    /*
      The code appearing IS the server's answer, and the dialog stays open to
      show it — so the code itself is what to wait for, not the dialog closing.
      Ten characters from a 32-symbol alphabet: the length was raised from six
      after an audit found a 500-address pool could expect a hit in about
      eighteen hours.
    */
    await page.getByText(/\b[A-Z0-9]{8,10}\b/).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(2.0);
  });

  await stage.beat('itIsAKey', async () => {
    const close = page.locator(`${DIALOG} button`).filter({ hasText: /Close|Done|Cancel/i }).last();
    if (await close.isVisible().catch(() => false)) await close.click();
    await page.goto(`${WEB_URL}/invitations`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Pending|Invitation/i).first().waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(1.8);
  });

  await stage.beat('andRevoked', async () => {
    /*
      ⚠️ THE REVOCATION IS NOT OPTIONAL. Everything filmed above is a working
      key until this runs; if this beat is ever removed, the video must be too.
    */
    /*
      ⚠️ `tr` ONLY. Filtering `tr, div` by text matches a div wrapper first and
      then looks for a button that is not in it. The revoke control is an
      icon-only button at the end of the row, which is also why it does not
      appear in a list of buttons filtered by their text.
    */
    const row = page.locator('tr').filter({ hasText: /Pending/i }).last();
    await row.scrollIntoViewIfNeeded();
    await stage.click(row.locator('button').last());
    const revoke = page.getByRole('menuitem').filter({ hasText: /Revoke|Cancel|Delete/i }).first();
    if (await revoke.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await revoke.click();
    } else {
      const button = page.locator('button').filter({ hasText: /Revoke/i }).first();
      await button.click();
    }
    const confirm = page.locator('[role="alertdialog"] button, [role="dialog"] button')
      .filter({ hasText: /Revoke|Confirm|Yes/i }).last();
    if (await confirm.isVisible({ timeout: 4_000 }).catch(() => false)) await confirm.click();
    await page.getByText(/Revoked/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.4);
  });

  await stage.beat('whereNext', async () => {
    /*
      Rest on the register itself rather than on the table element: revoking
      refetches, and for a moment there is no table in the DOM at all.
    */
    await stage.moveTo('text=/Create and manage invitation codes/');
    await stage.hold(1.6);
  });

  return stage.finish();
}
