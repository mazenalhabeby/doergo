/**
 * "Licences that expire" — video 31.
 *
 * ⚠️ THE CREDENTIAL BOARD IS EMPTY UNTIL A TYPE IS MARKED AS A CREDENTIAL and
 * somebody has one on file — the screen says exactly that. The seed provides a
 * driving licence type and four licences at every stage of running out, so the
 * columns the narration names each have something in them.
 *
 * ⚠️ NOTHING IS OPENED. The seeded documents name objects that were never
 * uploaded — a seed must not put demo files in a real bucket — so every beat
 * reads the register and none of them opens a document.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureLicencesThatExpire(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'licences-that-expire' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/documents/compliance`, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Credential compliance/i).first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('theBoard', async () => {
    await stage.moveTo('text=/Who has dropped out of the schedule/');
    await stage.hold(2.0);
  });

  await stage.beat('readNotTyped', async () => {
    await stage.moveTo('text=/EXPIRING/i');
    await stage.hold(1.8);
  });

  await stage.beat('whatIsShort', async () => {
    await wheel(page, 240);
    await stage.hold(1.8);
  });

  await stage.beat('chasing', async () => {
    await wheel(page, 220);
    await stage.hold(1.8);
  });

  await stage.beat('andTheEvidence', async () => {
    await stage.moveTo('text=/EXPIRED/i');
    await stage.hold(1.8);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, -200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
