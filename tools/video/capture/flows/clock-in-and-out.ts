/**
 * "Clock in and clock out" — video 11, for `myAttendanceTour` + `attendanceTour`.
 *
 * ⚠️ THE BROWSER IS TOLD IT IS STANDING ON THE DEPOT'S PIN (`RECORDING_POSITION`
 * in config, read from demo-data so the two cannot drift). The server re-checks
 * the geofence on clock-in, so a mismatch ends the video on "you are too far
 * from this workspace" — a failure that looks like a product bug and is not.
 *
 * ⚠️ THE DEPOT IS `workModel: 'NONE'` ON PURPOSE. With a rota, clocking out
 * forty seconds after clocking in is "early" and opens a dialog asking the
 * member to explain themselves — correct behaviour, wrong video. The rota's
 * own story is video 14.
 *
 * ⚠️ IT CLOCKS THE OWNER IN AND OUT FOR REAL. That is one more shift in the
 * seeded organisation, which is rebuilt on every render.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureClockInAndOut(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'clock-in-and-out' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.hold(0.8);

  await stage.beat('theButton', async () => {
    await stage.moveTo('button:has-text("Clock In")');
    await stage.hold(1.6);
  });

  await stage.beat('whereAreYou', async () => {
    /*
      ⚠️ THE SENTENCE ABOUT LOCATION NEEDS THE SCREEN THAT SAYS SO. The first
      cut clocked in from the navbar here, and the frame under "the server
      checks where you are" was a dashboard with a toast. The member's own
      shifts page prints the rule under the button — so the beat goes there,
      and the clock-in happens in the next one, where it belongs.
    */
    await page.goto(`${WEB_URL}/my/attendance`, { waitUntil: 'domcontentloaded' });
    await page.getByText('CURRENT STATUS', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    await stage.moveTo('text=/Uses your location/');
    await stage.hold(1.6);
  });

  await stage.beat('clockedIn', async () => {
    await stage.click('button:has-text("Clock In")');
    /*
      Two outcomes are both correct: assigned to one workspace, the app clocks
      straight in; with a choice, it opens a picker. The depot is this member's
      only workspace, so this is the straight path — the picker is handled
      rather than assumed, because a seed change would otherwise strand the
      beat on a dialog it never expected.
    */
    const picker = page.locator('[role="dialog"]');
    if (await picker.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await stage.hold(1.2);
      await picker.locator('button').filter({ hasText: 'Halstead Depot' }).first().click();
    }
    await page.getByText(/Clocked in|Clock Out/i).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.2);
  });

  await stage.beat('theShift', async () => {
    await reveal(page, ':text("CURRENT STATUS")', 0.6);
    await stage.moveTo(':text("CURRENT STATUS")');
    await stage.hold(2.0);
  });

  await stage.beat('clockOut', async () => {
    const out = page.locator('button:has-text("Clock Out")').last();
    await stage.click(out);
    /*
      The status turning back is the signal the server took it. A fixed wait
      here would film the next sentence over a shift still running.
    */
    await page.getByText(/Clocked out/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.2);
  });

  await stage.beat('theHistory', async () => {
    await reveal(page, '[data-tour="my-attn-history"]', 1.4);
    await wheel(page, 260);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 220);
    await stage.hold(1.2);
  });

  return stage.finish();
}
