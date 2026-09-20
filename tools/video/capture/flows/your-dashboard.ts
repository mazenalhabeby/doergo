/**
 * "Your dashboard" — video 32, for `welcomeAdmin`.
 *
 * Read-only from end to end. The screen already answers the three questions
 * somebody has at seven in the morning; the video's whole job is to point at
 * each in turn.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureYourDashboard(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'your-dashboard' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.hold(0.8);

  await stage.beat('whoIsHere', async () => {
    await stage.moveTo('[data-tour="dash-spaces"]');
    await stage.hold(1.8);
  });

  await stage.beat('byWorkspace', async () => {
    await stage.moveTo('text=/Kesterton Road Workshop/');
    await stage.hold(1.6);
  });

  await stage.beat('whatHappened', async () => {
    await stage.moveTo('[data-tour="dash-activity"]');
    await wheel(page, 180);
  });

  await stage.beat('waitingOnYou', async () => {
    await stage.moveTo('[data-tour="dash-pending"]');
    await stage.hold(2.0);
  });

  await stage.beat('noHunting', async () => {
    await wheel(page, 200);
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, -200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
