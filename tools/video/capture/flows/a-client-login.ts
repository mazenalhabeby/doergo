/**
 * "Give a client their own login" — video 35.
 *
 * ⚠️ THE PORTAL LIST DOES NOT OPEN ITS OWN DETAIL. Clicking a card navigates
 * nowhere — the first cut of this video was six beats of one static list
 * because of it. The portal's page is reached by URL instead, which is why the
 * seed gives the portal a fixed id (PORTAL_ID) exactly as it does the
 * workspaces.
 *
 * ⚠️ NOBODY IS INVITED. Sending a real portal invitation would email an
 * address that cannot receive it and leave an account behind; the video shows
 * where the door is and who may come through it.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { CLIENT_SITE, PORTAL_ID } from '../../demo-data.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

export async function captureAClientLogin(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'a-client-login' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/portals`, { waitUntil: 'domcontentloaded' });
  /*
    ⚠️ The heading changes with what is there: with no portal the page reads
    "What your clients see when they log in"; with one it becomes the
    workspace's own list. Waiting on the empty-state sentence times out on a
    page that is working perfectly.
  */
  await page.getByText(/B2C portals|Create portal/i).first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('thePhoneCalls', async () => {
    await stage.moveTo('text=/Clients you invite log in to order/');
    await stage.hold(2.0);
  });

  await stage.beat('aPortal', async () => {
    await stage.moveTo('text=/Brambleside Retail Park/');
    await stage.hold(1.6);
  });

  await stage.beat('whoGetsIn', async () => {
    await page.goto(`${WEB_URL}/locations/${CLIENT_SITE.id}/portals/${PORTAL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText(/Invite client/i).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    await stage.moveTo('text=/Invite client/');
    await stage.hold(1.8);
  });

  await stage.beat('whatTheySee', async () => {
    await stage.moveTo('text=/Fills the background of the client/');
    await stage.hold(2.0);
  });

  await stage.beat('andTheyCanAsk', async () => {
    await stage.moveTo('text=/They appear here as clients submit/');
    await stage.hold(2.0);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 240);
    await stage.hold(1.2);
  });

  return stage.finish();
}
