/**
 * "Create your first job" — video 05, for `tasksTour`.
 *
 * The create dialog, one field at a time, and nothing else: no client, no
 * assignee, no checklist. Those are videos of their own, and a first job that
 * needs six decisions is not a first job.
 *
 * ⚠️ THE DIALOG IS SECTIONED AND ONLY THE FIRST SECTION IS MOUNTED. Title and
 * priority are on screen; the due date lives behind "Schedule" and the
 * workspace behind "Organization", and neither control exists in the DOM until
 * its section is opened. Reaching for one directly waits the full timeout for
 * something that was never going to appear.
 *
 * ⚠️ THE CHECKLIST SECTION IS NOT TOUCHED, and must not be: the dialog sends
 * `checklistItems`, the gateway's DTO has no such property, and with
 * `forbidNonWhitelisted` on, one item makes the whole save fail with
 * "property checklistItems should not exist". The job simply cannot be
 * created. (See the note in create-a-job.ts, where it was found.)
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, dialogWith, goTo, openSection, reveal, scrollBy, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const JOB_TITLE = 'Roof unit making a noise on start-up — Block C';
const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';

export async function captureYourFirstJob(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'your-first-job' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('theBoard', async () => {
    await stage.moveTo(BOARD);
    await wheel(page, 240);
    await wheel(page, -240);
  });

  await stage.beat('theTitle', async () => {
    await stage.click('[data-tour="tasks-create"]');
    await page.locator(DIALOG).waitFor({ state: 'visible' });
    await page.locator('[data-tour="tasks-dialog-title"]').waitFor({ state: 'visible' });
    await stage.type('[data-tour="tasks-dialog-title"]', JOB_TITLE);
  });

  await stage.beat('howUrgent', async () => {
    /*
      Priority is a row of plain buttons, not a dropdown — and they are matched
      exactly, because "High" is a substring of nothing here but would be of a
      longer label the day somebody adds one.
    */
    const high = page.locator(`${DIALOG} button`).filter({ hasText: /^High$/ }).first();
    await stage.moveTo(high);
    await high.click();
    await stage.hold(1.0);
  });

  await stage.beat('whenItIsDue', async () => {
    await openSection(page, 'Schedule');
    await scrollBy(page, 160);
    /*
      The due date is a calendar in a popover. A day is chosen by its NUMBER,
      from the days the calendar itself offers — typing a date would need a
      format, and the format is the viewer's, not ours.
    */
    /*
      ⚠️ The trigger says "Select date" — `tasks.create.selectDate`, not the
      app's other, similar `common.selectDate` ("Pick a date"). Two strings a
      word apart, and the wrong one waits 45 seconds and fails. `.last()`
      because the Schedule section has two of these and the due date is the
      second: the first is the start date.
    */
    const dueButton = page.locator(`${DIALOG} button`).filter({ hasText: /Select date/i }).last();
    await stage.moveTo(dueButton);
    await dueButton.click();
    /*
      ⚠️ `table button`, not `[role="gridcell"] button` — this calendar puts no
      grid role on its cells. And past days are DISABLED, correctly, so the
      enabled ones are counted from today: the fourth is a few days out, which
      is what a job raised now would realistically be due.
    */
    const day = page.locator('table button:not([disabled])').nth(3);
    await day.waitFor({ state: 'visible', timeout: 15_000 });
    await day.click();
    await page.waitForTimeout(700);
    /*
      Dismiss the calendar by putting the cursor back in the title. Left open,
      it hangs over the next beat's subject — and Escape is not the way to do
      it: Radix closes the topmost layer, which on a bad day is the form.
    */
    await page.locator('[data-tour="tasks-dialog-title"]').click();
    await page.waitForTimeout(400);
    await stage.hold(0.8);
  });

  await stage.beat('whereItBelongs', async () => {
    /*
      ⚠️ NOT the dialog's "Organization" section — that one is Phase and Sprint,
      it is gated on the agile modules, and in a workspace without them it does
      not exist at all. This beat is about the WORKSPACE, which is a top-level
      select near the head of the form and arrives already set to the member's
      own. Pointing at it is the honest shot: a first job belongs where the
      person raising it works, and the field says so.
    */
    const space = page.locator(`${DIALOG} button[role="combobox"]`)
      .filter({ hasText: /Halstead|Select a workspace/i }).first();
    await space.scrollIntoViewIfNeeded();
    await stage.moveTo(space);
    await stage.hold(2.0);
  });

  await stage.beat('raiseIt', async () => {
    await stage.click('[data-tour="tasks-dialog-save"]');
    /*
      The dialog closing is the only honest signal the server took it — and
      when it does not close, the reason is on screen, so say what it was
      rather than reporting a timeout on a selector.
    */
    const form = dialogWith('[data-tour="tasks-dialog-title"]');
    try {
      await page.locator(form).waitFor({ state: 'hidden', timeout: 30_000 });
    } catch {
      const said = (await page.locator(form).innerText().catch(() => '')).slice(0, 400);
      throw new Error(`The job was not created. The dialog still says:\n${said}`);
    }
    await page.getByText(JOB_TITLE, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.0);
  });

  await stage.beat('openIt', async () => {
    /*
      ⚠️ THE BOARD SWALLOWS A PLAIN CLICK. The columns are drag-and-drop, and
      their pointer sensor reads Playwright's press-move-release as the start
      of a drag: the click lands, nothing navigates. The card's own href is
      read off it and used when the click does not take.
    */
    const card = page.getByText(JOB_TITLE, { exact: false }).first();
    const link = card.locator('xpath=ancestor-or-self::a').first();
    const href = await link.getAttribute('href');
    await stage.moveTo(`a[href="${href}"]`);
    await link.click();
    await page.waitForURL(/\/tasks\/[^/]+$/, { timeout: 8_000 }).catch(() => {});
    await page.locator('[data-tour="task-header"]').waitFor({ state: 'visible', timeout: 30_000 });
    await reveal(page, '[data-tour="task-sidebar"]', 1.2);
  });

  await stage.beat('whereNext', async () => {
    await stage.moveTo('[data-tour="task-sidebar"]');
    await stage.hold(1.2);
  });

  return stage.finish();
}
