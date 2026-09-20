/**
 * "A job, start to finish" — the flow for tasksTour / taskDetailTour.
 *
 * The office's own day: how it reads its work, how a job is raised against a
 * real client, and everything the job holds once somebody is doing it.
 *
 * ⚠️ THE CREATE DIALOG IS SECTIONED, and only the first section is on screen
 * when it opens. Title and priority are visible; the assignee lives behind
 * "Assignment" and the client behind "Location", and neither control exists in
 * the DOM until its section is opened. Reaching for one directly waits 45
 * seconds for an element that was never going to appear — which is exactly how
 * this failed the first time.
 *
 * ⚠️ THE DIALOG'S OWN CHECKLIST SECTION IS NOT USED, because using it makes the
 * job impossible to create. See the note on the `theChecklist` beat.
 *
 * ⚠️ THE CLIENT PICKER IS CONDITIONAL: the dialog renders it only where the
 * chosen workspace runs the `crm` module. The workspace arrives already set to
 * the member's own — Halstead Depot, which does run it — so this flow
 * deliberately does NOT touch that field. An org whose default workspace has no
 * CRM would need one chosen first, and the picker would otherwise be silently
 * absent with nothing on screen to say why.
 *
 * ⚠️ THE SEEDED CLIENTS CARRY AN ADDRESS BUT NO MAP POINT, and the dialog says
 * so in amber the moment one is chosen. The narration was first written to
 * claim the route followed automatically, which put a sentence over a warning
 * contradicting it; it now describes the pin as the step it is. Give the seeded
 * clients coordinates and the warning goes — the line stays true either way.
 *
 * ⚠️ Every wait is on a selector. Not one is a fixed sleep standing in for "the
 * page is probably ready by now", and nothing waits on `networkidle` — the
 * signed-in app holds a Socket.IO connection open, so the network is never idle
 * and such a wait can only ever time out.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { DEMO_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import type { Timeline } from '../../timeline.ts';

const CLIENT = 'Brambleside Retail Park';
const JOB_TITLE = 'Air curtain over main entrance — running cold';
const ASSIGNEE = 'Priya';

/** Written at the desk, so the engineer arrives knowing what finished means. */
const CHECKLIST = [
  'Isolate and lock off the supply',
  'Check heater elements and fan motor',
  'Log inlet and outlet temperatures',
];

const COMMENT = 'Site contact is Ada on the facilities desk — gate code is on the client record.';

/** Which board container is mounted depends on the saved view; see `theViews`. */
const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';
const DIALOG = '[role="dialog"]';

export async function captureCreateAJob(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'create-a-job' });
  const { page } = stage;

  // ── Setup, before the clock starts ────────────────────────────────────────
  // Signing in is not part of this story, and a cold route compile should not
  // be charged to the first sentence of narration.
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible' });
  await page.fill('#login-email', DEMO_LOGIN.email);
  await page.fill('#login-password', DEMO_LOGIN.password);
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });

  await page.goto(`${WEB_URL}/tasks`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-tour="tasks-create"]').waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('theBoard', async () => {
    // The seed leaves 14 jobs across several states, so this is a working board
    // rather than an empty one — which is the whole reason it opens here.
    await stage.moveTo(BOARD);
    await scrollSmoothly(page, 240);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  });

  await stage.beat('theViews', async () => {
    /*
      ⚠️ THE VIEW IS REMEMBERED PER PERSON, and only the chosen one is mounted.
      The three are `board`, `table` and `schedule` — not `list`, which is what
      the container inside the board view happens to be called.
    */
    await stage.click('[data-tour="tasks-view-table"]');
    await page.locator('[data-tour="tasks-list"], table').first()
      .waitFor({ state: 'visible', timeout: 20_000 });
    await stage.hold(1.4);
    await scrollSmoothly(page, 200);

    await stage.click('[data-tour="tasks-view-schedule"]');
    await page.locator('[data-tour="tasks-schedule"]').waitFor({ state: 'visible', timeout: 20_000 });
    await stage.hold(1.4);

    // Back to the board, which is where the rest of the video happens.
    await stage.click('[data-tour="tasks-view-board"]');
    await page.locator('[data-tour="tasks-board"]').waitFor({ state: 'visible', timeout: 20_000 });
  });

  await stage.beat('theSearch', async () => {
    const search = page.locator('[data-tour="tasks-search"] input').first();
    await stage.moveTo('[data-tour="tasks-search"]');
    await search.click();
    await typeSlowly(search, 'chiller');
    await stage.hold(1.6);
    // Clear it, or the board stays filtered for every shot that follows.
    await search.fill('');
    await page.locator('[data-tour="tasks-board"]').waitFor({ state: 'visible', timeout: 20_000 });
    await stage.hold(0.5);
  });

  await stage.beat('newJob', async () => {
    await stage.click('[data-tour="tasks-create"]');
    await page.locator(DIALOG).waitFor({ state: 'visible' });
    await page.locator('[data-tour="tasks-dialog-title"]').waitFor({ state: 'visible' });
    await stage.type('[data-tour="tasks-dialog-title"]', JOB_TITLE);
    // Priority is a row of plain buttons, not a dropdown.
    await page.locator(`${DIALOG} button`).filter({ hasText: /^High$/ }).first().click();
    await stage.hold(0.6);
  });

  await stage.beat('theClient', async () => {
    await openSection(page, 'Location');
    await pickFromSelect(page, /No client|Client to visit/i, CLIENT);
    await stage.hold(1.2);
  });

  await stage.beat('assign', async () => {
    await openSection(page, 'Assignment');
    await pickFromSelect(page, /Select a team member/i, ASSIGNEE);
    await stage.click('[data-tour="tasks-dialog-save"]');
    // The dialog closing is the only honest signal the server took it.
    await page.locator(DIALOG).waitFor({ state: 'hidden', timeout: 30_000 });
    // The board refetches; the new job appearing on it is the signal.
    await page.getByText(JOB_TITLE, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
  });

  await stage.beat('theJob', async () => {
    /*
      ⚠️ THE BOARD SWALLOWS THE CLICK. Each card is a real anchor, but the
      columns are drag-and-drop and their pointer sensor treats the
      press-move-release Playwright produces as the start of a drag — so the
      click lands, the card does not move, and no navigation ever happens. The
      href is read off the card and used if the click alone does not take.
    */
    const card = page.getByText(JOB_TITLE, { exact: false }).first();
    const link = card.locator('xpath=ancestor-or-self::a').first();
    const href = await link.getAttribute('href');
    await stage.moveTo(`a[href="${href}"]`);
    await link.click();
    await page.waitForURL(/\/tasks\/[^/]+$/, { timeout: 8_000 }).catch(async () => {
      if (href) await page.goto(`${WEB_URL}${href}`, { waitUntil: 'domcontentloaded' });
    });
    await page.locator('[data-tour="task-header"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-tour="task-sidebar"]').waitFor({ state: 'visible', timeout: 30_000 });
    await stage.moveTo('[data-tour="task-sidebar"]');
  });

  await stage.beat('theChecklist', async () => {
    /*
      ⚠️ THE CHECKLIST CANNOT BE SET WHILE CREATING THE JOB — not a choice about
      pacing, a bug in the product. The New Task dialog sends `checklistItems`
      and the gateway's CreateTaskDto has no such property, so with
      `forbidNonWhitelisted` on, adding a single item makes the whole save fail:

        400  "property checklistItems should not exist"

      The dialog offers the section, accepts the typing, and then the job cannot
      be created at all. (The RECURRING path sends `checklist`, which is
      accepted — which is why this has gone unnoticed.) Filmed here instead,
      where the feature genuinely works, one item at a time through its own
      endpoint.
    */
    const CL = '[data-tour="task-checklist"]';
    await page.locator(CL).scrollIntoViewIfNeeded();
    await stage.moveTo(CL);

    // The section is collapsed on a fresh job; its header is the toggle.
    const input = page.locator(`${CL} input`).first();
    if (!(await input.isVisible().catch(() => false))) {
      await page.locator(`${CL} button`).filter({ hasText: 'Checklist' }).first().click();
      await page.waitForTimeout(700);
    }
    await expect(input).toBeVisible({ timeout: 20_000 });

    for (const item of CHECKLIST) {
      await input.click();
      await typeSlowly(input, item);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    // Tick the first one, so the shot shows a checklist being worked, not typed.
    const firstTick = page.locator(`${CL} button[role="checkbox"], ${CL} input[type="checkbox"]`).first();
    if (await firstTick.isVisible().catch(() => false)) {
      await firstTick.click();
      await page.waitForTimeout(600);
    }
    await stage.hold(0.8);
  });

  await stage.beat('theWork', async () => {
    await page.locator('[data-tour="task-subtasks"]').scrollIntoViewIfNeeded();
    await stage.moveTo('[data-tour="task-subtasks"]');
    await stage.hold(1.0);
    await page.locator('[data-tour="task-attachments"]').scrollIntoViewIfNeeded();
    await stage.moveTo('[data-tour="task-attachments"]');
    await scrollSmoothly(page, 220);
  });

  await stage.beat('theSteps', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.locator('[data-tour="task-header"]').waitFor({ state: 'visible' });
    await stage.moveTo('[data-tour="task-header"]');

    /*
      ⚠️ THE NEXT STEPS COME FROM THE ORGANISATION'S OWN WORKFLOW, so they are
      matched by what they are NOT rather than by name: anything resembling a
      cancellation or an edit is skipped, and a workflow offering no forward
      step simply leaves the shot resting on the header. Naming a status here
      would date the video the day somebody edits their workflow.
    */
    const step = page
      .locator('[data-tour="task-header"] button')
      .filter({ hasText: /\w/ })
      .filter({ hasNotText: /cancel|edit|delete|close/i })
      .last();

    if (await step.isVisible().catch(() => false)) {
      await step.click();
      await page.waitForTimeout(1500);
    }
    await stage.hold(0.8);
  });

  await stage.beat('theComment', async () => {
    const BOX = '[data-tour="task-comments"]';
    await page.locator(BOX).scrollIntoViewIfNeeded();
    await stage.moveTo(BOX);

    const box = page.locator(`${BOX} textarea`).first();
    await expect(box).toBeVisible({ timeout: 20_000 });
    await box.click();
    await typeSlowly(box, COMMENT);

    /*
      ⚠️ ENTER ALONE DID NOT SEND IT, despite the placeholder saying it would —
      the first cut of this beat typed the comment, pressed Enter, and filmed
      "No comments yet" for fifteen seconds while the narration explained that
      this is where things get said. The send button is the reliable path; Enter
      is tried first only because that is what the placeholder tells a viewer to
      do, and it should be what the video shows working.
    */
    await page.keyboard.press('Enter');

    const posted = page.locator(BOX).getByText('Ada on the facilities desk', { exact: false }).first();
    if (!(await posted.isVisible({ timeout: 3_000 }).catch(() => false))) {
      const send = page.locator(`${BOX} button`).last();
      if (await send.isEnabled().catch(() => false)) await send.click();
    }

    // No `catch` here on purpose: a beat that films an empty comment box while
    // the voice says otherwise should fail the render, not pass quietly.
    await expect(posted).toBeVisible({ timeout: 20_000 });
    await stage.hold(0.8);
  });

  await stage.beat('theTrail', async () => {
    await page.locator('[data-tour="task-activity"]').scrollIntoViewIfNeeded();
    await stage.moveTo('[data-tour="task-activity"]');
    await scrollSmoothly(page, 300);
  });

  return stage.finish();
}

/**
 * Open one of the create dialog's collapsed sections.
 *
 * The section headers are plain buttons carrying their own name, which is also
 * how they are told apart from the fields inside them.
 */
async function openSection(page: Page, name: string): Promise<void> {
  const button = page.locator(`${DIALOG} button`).filter({ hasText: name }).first();
  await expect(button).toBeVisible({ timeout: 20_000 });
  await button.click();
  await page.waitForTimeout(600);
}

/**
 * Choose a value from one of the dialog's dropdowns.
 *
 * ⚠️ THESE ARE NOT `<select>` ELEMENTS. They are Radix listboxes: the trigger is
 * a `button[role="combobox"]` carrying either its placeholder or its current
 * value, and the options are rendered in a PORTAL at the end of the body —
 * outside the dialog — so a locator scoped to the dialog finds the trigger and
 * never the option.
 *
 * The trigger is matched on its TEXT because the form's fields carry no ids and
 * its labels are translated at runtime. Pass a pattern covering the
 * placeholder, since a field arriving pre-filled shows its value instead.
 */
async function pickFromSelect(page: Page, trigger: RegExp, option: string): Promise<void> {
  const button = page
    .locator(`${DIALOG} button[role="combobox"]`)
    .filter({ hasText: trigger })
    .first();
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible({ timeout: 20_000 });
  await button.click();

  const choice = page.getByRole('option').filter({ hasText: option }).first();
  await expect(choice).toBeVisible({ timeout: 20_000 });
  await choice.click();
  // The listbox unmounts on select; the next field is not clickable until it has.
  await expect(page.getByRole('option').first()).toBeHidden({ timeout: 10_000 }).catch(() => {});
}

/**
 * Type into a locator at something like a person's speed.
 *
 * `fill()` sets the value in one frame, which on video looks like the text was
 * pasted — and in the search box it also skips every intermediate query, so the
 * list never visibly narrows, which is the whole point of that shot.
 */
async function typeSlowly(locator: Locator, text: string): Promise<void> {
  await locator.pressSequentially(text, { delay: 45 });
}

/**
 * Scroll by a distance over ~700ms.
 *
 * WHY not `scrollIntoView({behavior:'smooth'})` alone: the browser's own smooth
 * scroll finishes in about 300ms whatever the distance, which on video reads as
 * a jump-cut. Stepping it makes the page move at something like the speed a
 * person scrolls, so the viewer can follow what is passing.
 */
async function scrollSmoothly(page: Page, distance: number): Promise<void> {
  const steps = 26;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(27);
  }
}
