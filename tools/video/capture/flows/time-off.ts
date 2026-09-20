/**
 * "Time off" — video 15, for `pageMyTimeoff`.
 *
 * Both sides of one request: the member asking, with their allowance in front
 * of them, and the desk answering, with the consequences in front of it.
 *
 * ⚠️ THE REQUEST FORM IS BELOW THE CALENDAR AND DOES NOTHING UNTIL DAYS ARE
 * PICKED. "Request vacation" stays disabled and the summary reads "0 days", so
 * a flow that chose a reason and pressed send would film a button that refuses
 * to work while the narration says it was sent.
 *
 * ⚠️ PENDING LEAVE IS NOT APPROVED FROM THE SCHEDULE PAGE. Those cards are
 * verdicts — what approving WOULD cost — and carry no buttons. The Days off tab
 * on the attendance board shows only leave already approved. The decision is
 * taken on the member's own Time Off tab.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { OWNER } from '../../demo-data.ts';
import { openStage } from '../runner.ts';
import { goTo, openTab, reveal, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** Two days far enough out that they are always in the month first shown. */
const DAYS = ['24', '26'];

export async function captureTimeOff(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'time-off' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await page.goto(`${WEB_URL}/my/time-off`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Why are you away?', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('whatIsLeft', async () => {
    /*
      ⚠️ Case-INSENSITIVE. The allowance heading is uppercased in CSS, so the
      DOM says "vacation days left" and a regex written the way the screen
      reads matches nothing.
    */
    await stage.moveTo('text=/vacation days left/i');
    await stage.hold(1.8);
  });

  await stage.beat('pickTheDays', async () => {
    for (const day of DAYS) {
      await stage.click(`button:text-is("${day}")`);
      await page.waitForTimeout(600);
    }
    await stage.hold(1.0);
  });

  await stage.beat('sayWhy', async () => {
    await reveal(page, 'text=Why are you away?', 0.5);
    await stage.click('button:has-text("Vacation")');
    await stage.hold(1.4);
  });

  await stage.beat('sendIt', async () => {
    const send = page.locator('button').filter({ hasText: /^Request vacation$/i }).first();
    await send.scrollIntoViewIfNeeded();
    if (await send.isDisabled().catch(() => false)) {
      throw new Error('The request button is disabled — no days were picked, so nothing would be sent.');
    }
    await stage.click(send);
    await page.getByText(/awaiting approval|My requests/i).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await wheel(page, 260);
    await stage.hold(1.0);
  });

  await stage.beat('atTheDesk', async () => {
    await page.goto(`${WEB_URL}/schedule`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Waiting on you', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 60_000 });
    await stage.moveTo('text=Waiting on you');
    await stage.hold(1.6);
  });

  await stage.beat('withConsequences', async () => {
    await stage.moveTo('text=/Would break cover/');
    await stage.hold(2.0);
  });

  await stage.beat('answered', async () => {
    await goTo(stage, page, 'members', '[data-tour="members-search"]');
    await stage.click(`button:has-text("${OWNER.firstName} ${OWNER.lastName}")`);
    await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
    await openTab(stage, page, '[role="tab"]:has-text("Time Off")', 'text=/Pending|Approve/i');
    /*
      ⚠️ APPROVE IS BEHIND THE ROW'S OWN MENU, not a button on the row. The
      first cut looked for a plain Approve, found none, and filmed a request
      still marked Pending under a narration saying it had been answered — the
      exact defect this pipeline produces. The badge changing is the proof.
    */
    /*
      ⚠️ `div:has(button)` — the innermost element carrying the date has no
      button in it, so filtering plain `div`s by text and taking the last one
      lands on a text node's wrapper and finds nothing. This asks for the
      innermost block that holds BOTH the request and a control.
    */
    const request = page.locator('div:has(> button), div:has(button)')
      .filter({ hasText: /Sep 24, 2026/ })
      .last();
    await request.scrollIntoViewIfNeeded();
    await stage.click(request.locator('button').last());
    const approve = page.getByRole('menuitem').filter({ hasText: /Approve/i }).first();
    await approve.waitFor({ state: 'visible', timeout: 15_000 });
    await approve.click();
    /*
      ⚠️ AND THEN IT ASKS. The menu item opens a confirmation — "Approve this
      time off request for …?" — so the click on the menu is not the decision.
      Without this the beat ends on an open dialog while the narration says the
      request was answered.
    */
    /*
      ⚠️ AND IT IS AN ALERTDIALOG, not a dialog. Radix gives a confirmation
      `role="alertdialog"`, so a selector scoped to `[role="dialog"]` finds
      nothing and times out fifteen seconds later on a screen that is plainly
      showing the button.
    */
    const confirm = page
      .locator('[role="alertdialog"] button, [role="dialog"] button')
      /*
        ⚠️ THE CONFIRM BUTTON SAYS "Approved", past tense — it names the state
        it sets, not the act. `/^Approve$/` matches nothing and waits out the
        full timeout on a screen that is plainly showing the button. The menu
        item above it is the same: "Approved", "Rejected", "Cancel Request".
      */
      .filter({ hasText: /^Approved?$/ })
      .last();
    await confirm.waitFor({ state: 'visible', timeout: 15_000 });
    await stage.hold(1.0);
    await stage.click(confirm);
    await page.locator('[role="alertdialog"], [role="dialog"]').first()
      .waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
    await page.getByText(/Approved/i).first().waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.2);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
