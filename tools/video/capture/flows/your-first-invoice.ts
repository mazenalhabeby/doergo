/**
 * "Your first invoice" — video 26, for `pageInvoices`.
 *
 * ⚠️ IT LEAVES A DRAFT BEHIND, and that is the point of the last beat: a draft
 * is a draft until somebody issues it. Video 27 picks it up from there.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, pickFromSelect, signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const CLIENT = 'Thorncastle Logistics';

export async function captureYourFirstInvoice(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'your-first-invoice' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.click('a[href="/invoices"]');
  await page.waitForURL(/\/invoices/, { timeout: 30_000 });
  await page.getByText(/OUTSTANDING/i).first().waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('whatIsOwed', async () => {
    await stage.moveTo('text=/OUTSTANDING/i');
    await wheel(page, 200);
  });

  await stage.beat('raiseOne', async () => {
    await stage.click('button:has-text("New Invoice"), a:has-text("New Invoice")');
    await page.waitForURL(/\/invoices\/new/, { timeout: 20_000 }).catch(() => {});
    await page.getByText('Who it is for', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 45_000 });
    /*
      ⚠️ THIS IS A PAGE, NOT A DIALOG, and the client is a NAME rather than a
      picker — "A client" chooses where the work is pulled from; who it is for
      is typed, with an offer to save them to the CRM. The first cut reached
      for a combobox, found none, and filmed an invoice reading "No client yet"
      for its whole length.
    */
    const name = page.locator('input:visible').first();
    await name.click();
    await typeSlowly(name, CLIENT);
    await page.waitForTimeout(700);
    await stage.hold(1.2);
  });

  await stage.beat('theLines', async () => {
    await stage.click('button:has-text("Add line")');
    await page.waitForTimeout(900);
    /*
      A line is a description, a quantity and a price. Typed into whatever the
      row put on screen, in order, rather than by field name — the row carries
      no ids and its labels are translated.
    */
    const cells = page.locator('input:visible');
    const count = await cells.count();
    if (count >= 3) {
      const description = cells.nth(count - 3);
      await description.click();
      await typeSlowly(description, 'Emergency call-out — loading bay door, 2 hours on site');
      const amount = cells.nth(count - 1);
      await amount.click();
      await typeSlowly(amount, '340');
    }
    await page.waitForTimeout(700);
    await stage.hold(1.2);
  });

  await stage.beat('theTotal', async () => {
    await wheel(page, 200);
    await stage.moveTo('text=/TOTAL/i');
    await stage.hold(2.0);
  });

  await stage.beat('stillADraft', async () => {
    await stage.click('button:has-text("Save draft")');
    /*
      Leaving the form is the signal it saved — the page refuses while there is
      no client name, and says so in the header rather than in a toast.
    */
    await page.waitForURL(/\/invoices(?!\/new)/, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
