/**
 * "The rota" — video 14, for `pageAvailability`.
 *
 * ⚠️ THE COVER VERDICTS ARE THE POINT, and they exist only where a workspace
 * carries a minimum. `minCover: 0` means NOT SET, not "nobody needed" — a
 * workspace left at zero shows "No minimum set" and none of the sentences in
 * this video have a screen. The depot is seeded at two.
 *
 * ⚠️ THE LEAVE HAS TO EXIST TOO. `seedTimeOff` puts four requests in, two of
 * them still waiting, so "the people asking to be off" is a list rather than
 * an empty state.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureTheRota(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'the-rota' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/schedule`, { waitUntil: 'domcontentloaded' });
  await page.getByText('On the floor right now', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('rightNow', async () => {
    await stage.moveTo('text=On the floor right now');
    await stage.hold(1.8);
  });

  await stage.beat('byWorkspace', async () => {
    /*
      ⚠️ CLICKED, and it has to be the depot. The page opens on whichever
      workspace sorts first — here a client site with NO minimum set — and the
      next sentence is about the minimum. Hovering the tab, as this did at
      first, left that sentence over a card reading "No minimum set", which is
      the opposite of what was being said. The depot is seeded at two.
    */
    await stage.click('button:has-text("Halstead Depot"), [role="tab"]:has-text("Halstead Depot")');
    await page.waitForTimeout(1200);
    await stage.hold(1.0);
  });

  await stage.beat('theFloor', async () => {
    // The card's own header carries the count and the floor beside it.
    await stage.moveTo('text=/Halstead Depot/ >> nth=-1');
    await stage.hold(2.0);
  });

  await stage.beat('whoIsAsking', async () => {
    await reveal(page, 'text=Waiting on you', 1.0);
    await stage.moveTo('text=Waiting on you');
    await stage.hold(1.6);
  });

  await stage.beat('wouldBreakCover', async () => {
    await stage.moveTo('text=/Would break cover/');
    await stage.hold(2.0);
  });

  await stage.beat('theOnlyOne', async () => {
    await stage.moveTo('text=/Leave a trade uncovered/');
    await stage.hold(2.0);
  });

  await stage.beat('thenDecide', async () => {
    await wheel(page, 260);
    await stage.hold(1.8);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 220);
    await stage.hold(1.2);
  });

  return stage.finish();
}
