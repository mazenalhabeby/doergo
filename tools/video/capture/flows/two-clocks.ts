/**
 * "Worked and counted" — video 12.
 *
 * ⚠️ THIS VIDEO NEEDS A WORKSPACE WITH A ROTA, and the depot has none. Without
 * an expected start and end there is nothing for the actual times to differ
 * FROM: every shift reads the same both ways and the video has no subject. The
 * seed puts the workshop on shifts for exactly this (`seedRota`), with days
 * where somebody came in early and stayed late.
 *
 * ⚠️ THE MEMBER'S OWN ATTENDANCE TAB IS THE SCREEN THAT SHOWS BOTH NUMBERS.
 * The attendance board shows a duration; only here does the counted figure
 * carry "N on site" underneath it when the two differ — which is the whole
 * sentence this video is built on.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { goTo, openTab, reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** On the workshop rota — see seedRota. */
const ON_SHIFT = 'Iris Nakamura';

export async function captureTwoClocks(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'two-clocks' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'members', '[data-tour="members-search"]');
  await stage.click(`button:has-text("${ON_SHIFT}")`);
  await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
  /*
    The tab's panel is proved by its own table header, not by the trigger — a
    trigger is visible whether or not anything opened.
  */
  await openTab(stage, page, '[role="tab"]:has-text("Attendance")', 'text=/on site/');
  await stage.hold(0.8);

  await stage.beat('oneShift', async () => {
    await stage.moveTo('text=/on site/');
    await stage.hold(1.6);
  });

  await stage.beat('whatTheClockSaw', async () => {
    await stage.moveTo('th:has-text("Clock In"), th:has-text("In")');
    await stage.hold(1.8);
  });

  await stage.beat('whatIsCounted', async () => {
    await stage.moveTo('text=/on site/');
    await stage.hold(2.0);
  });

  await stage.beat('inEarly', async () => {
    await wheel(page, 160);
    await stage.hold(1.6);
  });

  await stage.beat('theRest', async () => {
    await wheel(page, 160);
    await stage.hold(1.6);
  });

  await stage.beat('bothKept', async () => {
    await reveal(page, 'table', 0.6);
    await stage.hold(1.8);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
