/**
 * A twenty-second technical test — NOT a publishable video.
 *
 * Its only job is to answer two questions cheaply: does the narration sound
 * right, and does the picture sit under the words it belongs to. Two beats is
 * enough for both, and it costs a few hundred characters instead of the ~1,400
 * a real script spends every time somebody wants to hear a voice.
 *
 * ⚠️ It stops the moment the clock starts running. Anything past that is the
 * real video's job, and a test that creeps toward being the real thing stops
 * being cheap to re-run.
 */

import { expect } from '@playwright/test';
import { DEMO_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import type { Timeline } from '../../timeline.ts';

const CLOCK_CARD = '[data-tour="my-attn-clock"]';
const CLOCK_IN = `${CLOCK_CARD} button:has-text("Clock In")`;
const CLOCK_OUT = `${CLOCK_CARD} button:has-text("Clock Out")`;

export async function captureVoiceTest(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'voice-test' });
  const { page } = stage;

  // Outside any beat, so the video opens on a drawn page and a cold route
  // compile is not charged to the narration.
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-email').waitFor({ state: 'visible' });
  await stage.hold(0.8);

  await stage.beat('signIn', async () => {
    await stage.type('#login-email', DEMO_LOGIN.email);
    await stage.type('#login-password', DEMO_LOGIN.password);
    await stage.click('form button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
    await page.waitForLoadState('networkidle');

    await page.goto(`${WEB_URL}/my/attendance`, { waitUntil: 'networkidle' });
    await page.locator(CLOCK_CARD).waitFor({ state: 'visible' });
    /*
      ⚠️ ENABLED, not merely present. The button renders disabled until the
      member's clock-in workspaces have loaded, and a click in that window does
      nothing — the video would show a button pressed with no result.
    */
    await expect(page.locator(CLOCK_IN)).toBeEnabled({ timeout: 30_000 });
  });

  await stage.beat('clockIn', async () => {
    await stage.click(CLOCK_IN);
    // The swap to Clock Out is the only honest signal the server accepted it.
    await expect(page.locator(CLOCK_OUT)).toBeVisible({ timeout: 30_000 });
    await stage.moveTo('[data-tour="my-attn-status"]');
  });

  return stage.finish();
}
