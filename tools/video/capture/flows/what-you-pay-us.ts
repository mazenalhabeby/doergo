/**
 * "What you pay us" — video 28, for `pageSettings`.
 *
 * ⚠️ THE SEEDED ORGANISATION IS ON `billingMode: EXTERNAL`, so the page says
 * "Billed by agreement — nothing is charged automatically" and shows the list
 * price. That is deliberate: a recording organisation must never reach Stripe,
 * and the figures are the same ones a paying customer sees. The narration
 * describes how the bill is BUILT, which is true either way.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureWhatYouPayUs(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'what-you-pay-us' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/settings/billing`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/You pay for the people who use/i).first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('noBundles', async () => {
    await stage.moveTo('text=/You pay for the people who use/i');
    await stage.hold(1.8);
  });

  await stage.beat('theSeats', async () => {
    await stage.moveTo('text=/× €9.99/');
    await stage.hold(1.8);
  });

  await stage.beat('perWorkspace', async () => {
    await stage.moveTo('text=/PER WORKSPACE/i');
    await wheel(page, 220);
  });

  await stage.beat('theOptions', async () => {
    await wheel(page, 260);
    await stage.hold(1.8);
  });

  await stage.beat('itMoves', async () => {
    await wheel(page, 240);
    await stage.hold(1.8);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
