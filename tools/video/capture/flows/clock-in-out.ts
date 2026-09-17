/**
 * "Clock in and clock out" — the flow for the myAttendanceTour /
 * attendanceTour pair.
 *
 * One continuous session as one member. Mara is an EMPLOYEE who holds
 * `canViewAllTasks`, so she legitimately sees both halves of the story: her
 * own shift, and the team board her office reads. That is why this is one
 * video and not two — a second login would mean a second recording and a cut
 * the viewer has to be told about.
 *
 * ⚠️ Every wait in here is on a selector or a network state. Not one is a
 * fixed sleep standing in for "the page is probably ready by now", because
 * that is the sleep that passes on this laptop and fails on a cold Next dev
 * server, mid-render, on video.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DEMO_LOGIN, WEB_URL } from '../../config.ts';
import { openStage, type Stage } from '../runner.ts';
import type { Timeline } from '../../timeline.ts';

/** Scoped to the page's own card: the navbar widget has the same button text. */
const CLOCK_CARD = '[data-tour="my-attn-clock"]';
const CLOCK_IN = `${CLOCK_CARD} button:has-text("Clock In")`;
const CLOCK_OUT = `${CLOCK_CARD} button:has-text("Clock Out")`;

export async function captureClockInOut(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'clock-in-out' });
  const { page } = stage;

  // ── Setup, before the clock starts ────────────────────────────────────────
  // Done outside any beat so the video opens on a drawn page rather than on
  // white, and so a cold route compile is not charged to the narration.
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-email').waitFor({ state: 'visible' });
  await stage.hold(0.8);

  await stage.beat('signIn', async () => {
    await stage.type('#login-email', DEMO_LOGIN.email);
    await stage.type('#login-password', DEMO_LOGIN.password);
    await stage.click('form button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
    // The dashboard streams its cards in; wait for it to settle rather than
    // filming a half-drawn page.
    await page.waitForLoadState('networkidle');
  });

  await stage.beat('openMyShifts', async () => {
    await page.goto(`${WEB_URL}/my/attendance`, { waitUntil: 'networkidle' });
    await page.locator(CLOCK_CARD).waitFor({ state: 'visible' });
    /*
      ⚠️ Wait for the button to be ENABLED, not merely present. It renders
      disabled until the member's clock-in workspaces have loaded — clicking
      it in that window does nothing at all, and the video would show a button
      being pressed with no result.
    */
    await expect(page.locator(CLOCK_IN)).toBeEnabled({ timeout: 30_000 });
    await stage.moveTo('[data-tour="page-my-attendance"]');
  });

  await stage.beat('clockIn', async () => {
    await stage.click(CLOCK_IN);
    /*
      The button is replaced by Clock Out once the shift is running. Waiting on
      that swap is the only honest signal that the server accepted it — a
      toast can be missed, and a fixed sleep would film a spinner.
    */
    await expect(page.locator(CLOCK_OUT)).toBeVisible({ timeout: 30_000 });
  });

  await stage.beat('onTheClock', async () => {
    // Rest on the running timer. Its seconds ticking are the shot.
    await stage.moveTo('[data-tour="my-attn-status"]');
  });

  await stage.beat('clockOut', async () => {
    await stage.click(CLOCK_OUT);

    /*
      A shift short of its scheduled end opens a dialog asking why. The
      recording space is deliberately workModel NONE so no end is expected and
      no dialog appears — but this handles it anyway, because the alternative
      is that somebody later gives the space a rota and this flow hangs on an
      invisible modal with no clue as to why.
    */
    const earlyDialog = page.locator('[role="dialog"]:has-text("Clock out")');
    if (await earlyDialog.isVisible().catch(() => false)) {
      const reason = earlyDialog.locator('textarea, input[type="text"]').first();
      if (await reason.isVisible().catch(() => false)) {
        await reason.fill('End of shift');
      }
      await earlyDialog.getByRole('button', { name: /clock out|confirm/i }).first().click();
    }

    await expect(page.locator(CLOCK_IN)).toBeVisible({ timeout: 30_000 });
  });

  await stage.beat('history', async () => {
    await stage.moveTo('[data-tour="my-attn-history"]');
    await page.locator('[data-tour="my-attn-history"]').scrollIntoViewIfNeeded();
    await scrollSmoothly(page, 320);
  });

  await stage.beat('teamBoard', async () => {
    await page.goto(`${WEB_URL}/attendance`, { waitUntil: 'networkidle' });
    await page.locator('[data-tour="attendance-header"]').waitFor({ state: 'visible' });
    await page.locator('[data-tour="tracking-stats"]').waitFor({ state: 'visible' });
    await stage.moveTo('[data-tour="tracking-stats"]');
  });

  await stage.beat('records', async () => {
    await page.locator('[data-tour="tracking-table"]').waitFor({ state: 'visible' });
    await stage.moveTo('[data-tour="tracking-table"]');
    await scrollSmoothly(page, 360);
  });

  await stage.beat('approvals', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(500);
    await stage.click('[data-tour="attendance-tab-approvals"]');
    // The tab panel mounts and fetches; wait for the content, not a timer.
    await page
      .locator('[data-tour="approvals-content"]')
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {
        // Nothing awaiting approval is a legitimate outcome, and the empty
        // state is a perfectly good final shot. Never fail the render for it.
      });
    await stage.hold(0.6);
  });

  return stage.finish();
}

/**
 * Scroll by a distance over ~700ms.
 *
 * WHY not `scrollIntoView({behavior:'smooth'})` alone: the browser's own
 * smooth scroll finishes in about 300ms whatever the distance, which on video
 * reads as a jump-cut. Stepping it makes the page move at something like the
 * speed a person scrolls, so the viewer can follow what is passing.
 */
async function scrollSmoothly(page: Page, distance: number): Promise<void> {
  const steps = 26;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(27);
  }
}
