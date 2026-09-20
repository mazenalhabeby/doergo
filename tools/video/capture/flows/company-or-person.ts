/**
 * "A company, or a person" — video 21.
 *
 * ⚠️ THE SEEDED CLIENTS HAVE A CONTACT NAME AND NO CONTACT PEOPLE. The name
 * on the record is a note — "Oskar Lindqvist" as text — and the product offers
 * to turn it into a person of its own. That offer IS this video's subject, so
 * the flow uses it rather than typing a stranger in.
 *
 * ⚠️ A CONTACT IS NOT A CLIENT. `Customer.isContact` keeps them out of the
 * client list and out of what is billed — a firm with six contacts is not six
 * clients. The narration says so because the screen does not.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const CLIENT = 'Pilgrove Hotels';

export async function captureCompanyOrPerson(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'company-or-person' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.click('a[href="/clients"]');
  await page.waitForURL(/\/clients/, { timeout: 30_000 });
  await page.getByText(CLIENT).first().waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('youRingAPerson', async () => {
    await wheel(page, 200);
    await wheel(page, -200);
  });

  await stage.beat('theCompany', async () => {
    await stage.click(`text=${CLIENT}`);
    await page.waitForURL(/\/customers\/[^/]+/, { timeout: 20_000 });
    await page.getByText('CONTACT PEOPLE', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.moveTo('text=/CONTACT PEOPLE/i');
    await stage.hold(1.4);
  });

  await stage.beat('addAContact', async () => {
    /*
      The record already carries a contact NAME as a note. Promoting it is one
      button, and it is the honest path: nobody retypes a name the record
      already has.
    */
    await stage.click('button:has-text("Make a contact person")');
    await page.locator(DIALOG).waitFor({ state: 'visible', timeout: 20_000 });
    const role = page.locator(`${DIALOG} input`).nth(1);
    if (await role.isVisible().catch(() => false)) {
      await role.click();
      await typeSlowly(role, 'Maintenance Manager');
    }
    await stage.hold(1.2);
  });

  await stage.beat('primary', async () => {
    /*
      The dialog carries a "Primary contact" tick, and the narration is about
      it — so it is ticked here rather than left for the viewer to imagine.
    */
    const primary = page.locator(`${DIALOG} label:has-text("Primary"), ${DIALOG} button[role="checkbox"]`).first();
    if (await primary.isVisible().catch(() => false)) {
      await stage.moveTo(primary);
      await primary.click();
      await page.waitForTimeout(500);
    }
    const save = page.locator(`${DIALOG} button`).filter({ hasText: /Save|Add contact|Create/i }).last();
    await stage.click(save);
    await page.locator(DIALOG).waitFor({ state: 'hidden', timeout: 30_000 });
    await page.getByText('Oskar Lindqvist', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.4);
  });

  await stage.beat('notAClient', async () => {
    await stage.click('a[href="/clients"]');
    await page.waitForURL(/\/clients/, { timeout: 30_000 });
    await page.getByText(CLIENT).first().waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.8);
  });

  await stage.beat('bothWays', async () => {
    /*
      The list splits by what a record IS — companies, people, contacts — and
      the same link reads from either end.
    */
    const contacts = page.locator('button').filter({ hasText: /^Contacts$/ }).first();
    if (await contacts.isVisible().catch(() => false)) {
      await stage.click(contacts);
      await page.waitForTimeout(1500);
    }
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 200);
    await stage.hold(1.2);
  });

  return stage.finish();
}
