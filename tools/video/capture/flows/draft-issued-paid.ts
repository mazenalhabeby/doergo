/**
 * "Draft, issued, sent, paid" — video 27.
 *
 * ⚠️ IT ISSUES A REAL INVOICE, and that is the point: issuing fixes the
 * numbers and gives the document its place in the books. A video that mimed
 * the step would be describing the feature rather than showing it. The seeded
 * organisation is rebuilt on every render.
 *
 * ⚠️ A DRAFT'S DOCUMENT IS WATERMARKED ON PURPOSE. Without the issued step the
 * only clean document a business could produce was one recording a delivery
 * that had not happened — so the watermark is filmed rather than cut around.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

/** Seeded as a draft — see seedInvoices. */
const DRAFT_CLIENT = 'Castlemere Schools Trust';

export async function captureDraftIssuedPaid(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'draft-issued-paid' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.click('a[href="/invoices"]');
  await page.waitForURL(/\/invoices/, { timeout: 30_000 });
  await page.getByText(/OUTSTANDING/i).first().waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('fourStates', async () => {
    await wheel(page, 220);
    await stage.hold(1.8);
  });

  await stage.beat('theDraft', async () => {
    await stage.click(`text=${DRAFT_CLIENT}`);
    await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_500);
    await stage.hold(1.8);
  });

  await stage.beat('issuing', async () => {
    const issue = page.locator('button:visible').filter({ hasText: /Issue/i }).first();
    await issue.waitFor({ state: 'visible', timeout: 20_000 });
    await stage.click(issue);
    const confirm = page.locator('[role="alertdialog"] button, [role="dialog"] button')
      .filter({ hasText: /Issue|Confirm/i }).last();
    if (await confirm.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await stage.hold(1.0);
      await confirm.click();
    }
    await page.getByText(/Issued|Sent|Unpaid/i).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.2);
  });

  await stage.beat('theCleanDocument', async () => {
    await wheel(page, 260);
    await stage.hold(2.0);
  });

  await stage.beat('sentAndPaid', async () => {
    /*
      ⚠️ THE ACTIONS ARE SEQUENTIAL AND NAMED FOR WHAT THEY RECORD. An issued
      invoice offers "Mark it as sent"; only a sent one offers paid. The first
      cut looked for "Mark Paid" on an invoice that had just been issued, found
      nothing, and filmed two sentences over an unchanged screen.
    */
    const sent = page.locator('button:visible').filter({ hasText: /Mark it as sent/i }).first();
    if (await sent.isVisible().catch(() => false)) {
      /*
        The cursor rests on the control the sentence is about before pressing
        it: marking an invoice sent opens a confirmation of its own, and a beat
        that only pressed would spend its sentence on a dialog.
      */
      await stage.moveTo(sent);
      await stage.hold(1.2);
      await sent.click();
      const confirmSent = page.locator('[role="alertdialog"] button, [role="dialog"] button')
        .filter({ hasText: /sent|confirm/i }).last();
      if (await confirmSent.isVisible({ timeout: 4_000 }).catch(() => false)) await confirmSent.click();
      await page.waitForTimeout(2_000);
    }
    const paid = page.locator('button:visible').filter({ hasText: /paid/i }).first();
    if (await paid.isVisible().catch(() => false)) {
      await stage.click(paid);
      const confirm = page.locator('[role="alertdialog"] button, [role="dialog"] button')
        .filter({ hasText: /Paid|Confirm/i }).last();
      if (await confirm.isVisible({ timeout: 4_000 }).catch(() => false)) await confirm.click();
      await page.waitForTimeout(2_000);
    }
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
