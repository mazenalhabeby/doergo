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
    await stage.hold(1.4);
  });

  await stage.beat('decideFirst', async () => {
    /*
      The role and the workspace, both chosen before anybody has the code.
      Matched on their placeholders: these fields carry no ids and their
      labels are translated at runtime.
    */
    await pickFromSelect(page, /role|member/i, 'Field Engineer').catch(() => {});
    await pickFromSelect(page, /workspace|space/i, 'Halstead Depot').catch(() => {});
    await stage.hold(1.6);
  });

  await stage.beat('theCode', async () => {
    const send = page.locator(`${DIALOG} button`).filter({ hasText: /Invite|Create|Send|Generate/i }).last();
    await stage.click(send);
    /*
      The code appearing IS the server's answer — the dialog may stay open to
      show it, so the code itself is the thing to wait for, not the dialog
      closing.
    */
    await page.getByText(/[A-Z0-9]{8,10}/).first().waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.8);
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
    const row = page.locator('tr, div').filter({ hasText: /Pending/i }).last();
    const menu = row.locator('button').last();
    await stage.click(menu);
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
    await reveal(page, 'table, [role="table"]', 0.8);
    await stage.hold(1.2);
  });

  return stage.finish();
}
