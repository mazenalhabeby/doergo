/**
 * "Issue a contract and get it signed" — video 30.
 *
 * ⚠️ A CONTRACT IS NOT ISSUED BY HAND HERE. The screen says it plainly: a
 * template becomes a real contract the moment somebody accepts an invitation,
 * filled in with their name, job title and start date. The script asked for an
 * "issue" button until this was filmed; there is none, and the sentence now
 * describes what actually happens.
 *
 * ⚠️ NOBODY SIGNS ON CAMERA. Signing is the member's own screen, on their own
 * device. What the register shows instead — issued, not opened, awaiting
 * signature, signed — is the evidence trail, and that is what the last beats
 * narrate.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureContractSigned(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'contract-signed' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/documents/templates`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Contract templates', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('aTemplate', async () => {
    await stage.moveTo('text=/Pick something close and edit it/');
    await stage.hold(2.0);
  });

  await stage.beat('issueIt', async () => {
    await stage.moveTo('text=/A template becomes a real contract/');
    await stage.hold(2.2);
  });

  await stage.beat('theChain', async () => {
    await stage.click('text=/Employment contract/');
    await page.waitForTimeout(2_500);
    await stage.hold(1.6);
  });

  await stage.beat('theySign', async () => {
    await wheel(page, 280);
    await stage.hold(2.0);
  });

  await stage.beat('theEvidence', async () => {
    await page.goto(`${WEB_URL}/documents/all`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Every document in the organization/i).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    await stage.moveTo('text=/Awaiting signature/');
    await stage.hold(2.0);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 220);
    await stage.hold(1.2);
  });

  return stage.finish();
}
