/**
 * "Your first client" — video 20.
 *
 * ⚠️ A NEW CLIENT CAN LAND IN NO WORKSPACE AT ALL. Added from the All tab the
 * form once wrote `spaceId: NULL`, and the client was then invisible in every
 * workspace tab and outside the per-space CRM — saved, and nowhere. The form
 * asks now, and this flow answers it, because a video that skipped the field
 * would be teaching the shape of that bug.
 */

import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, dialogWith, pickFromSelect, signIn, typeSlowly, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const CLIENT = 'Marchfield Cold Storage';
const EMAIL = 'plant@marchfieldcold.example';

export async function captureYourFirstClient(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'your-first-client' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await stage.click('a[href="/clients"]');
  await page.waitForURL(/\/clients/, { timeout: 30_000 });
  await page.getByText(/Brambleside Retail Park/).first()
    .waitFor({ state: 'visible', timeout: 45_000 });
  await stage.hold(0.8);

  await stage.beat('theBook', async () => {
    await wheel(page, 260);
    await wheel(page, -260);
  });

  await stage.beat('addOne', async () => {
    /*
      ⚠️ "Add customer", not "Add client". The screen is headed CRM and talks
      about clients throughout, and the button says customer — so a filter
      written from the page's own vocabulary finds nothing.
    */
    const add = page.locator('button').filter({ hasText: /Add customer/i }).first();
    await stage.click(add);
    await page.locator(DIALOG).waitFor({ state: 'visible', timeout: 20_000 });
    const name = page.locator(`${DIALOG} input`).first();
    await name.click();
    await typeSlowly(name, CLIENT);
    await stage.hold(0.8);
  });

  await stage.beat('howToReachThem', async () => {
    /*
      ⚠️ THERE IS NO ADDRESS FIELD HERE, and the narration claimed one until
      this was filmed. A client is created with a name, a way of reaching them
      and a workspace; addresses live on the record afterwards, because a firm
      can have several and none of them is known when somebody first writes the
      name down.
    */
    const email = page.locator(`${DIALOG} input[type="email"]`).first();
    await email.click();
    await typeSlowly(email, EMAIL);
    const phone = page.locator(`${DIALOG} input[type="tel"]`).first();
    await phone.click();
    await typeSlowly(phone, '20 7946 0288');
    await stage.hold(1.0);
  });

  await stage.beat('whichWorkspace', async () => {
    /*
      ⚠️ REQUIRED, and it is the field this video exists to point at. Adding a
      client from the All tab once wrote no workspace at all: saved, and then
      invisible in every workspace tab and outside the per-space CRM.

      It is a plain `<select>` here rather than one of the app's listboxes.
    */
    const native = page.locator(`${DIALOG} select`).first();
    if (await native.isVisible().catch(() => false)) {
      await stage.moveTo(native);
      await native.selectOption({ label: 'Halstead Depot' });
    } else {
      await pickFromSelect(page, /Choose a workspace/i, 'Halstead Depot');
    }
    await page.waitForTimeout(600);
    await stage.hold(1.4);
  });

  await stage.beat('saved', async () => {
    const save = page.locator(`${DIALOG} button`).filter({ hasText: /Save|Create|Add/i }).last();
    await stage.click(save);
    await page.locator(DIALOG).waitFor({ state: 'hidden', timeout: 30_000 });
    await page.getByText(CLIENT, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.0);
  });

  await stage.beat('theirRecord', async () => {
    await stage.click(`text=${CLIENT}`);
    await page.waitForURL(/\/customers\/[^/]+/, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await stage.hold(1.6);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 240);
    await stage.hold(1.2);
  });

  return stage.finish();
}
