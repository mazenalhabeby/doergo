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
const ADDRESS = 'Marchfield Works, Ely Road, Slough SL2';
const CONTACT = 'Dilys Farrow';
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
    const add = page.locator('button').filter({ hasText: /New client|Add client|New Client/i }).first();
    await stage.click(add);
    await page.locator(DIALOG).waitFor({ state: 'visible', timeout: 20_000 });
    const name = page.locator(`${DIALOG} input`).first();
    await name.click();
    await typeSlowly(name, CLIENT);
    await stage.hold(0.8);
  });

  await stage.beat('whereTheyAre', async () => {
    const address = page.locator(`${DIALOG} input, ${DIALOG} textarea`)
      .filter({ hasNot: page.locator('[value]') }).first();
    const field = page.locator(`${DIALOG} input[placeholder*="ddress"], ${DIALOG} textarea[placeholder*="ddress"]`).first();
    const target = (await field.isVisible().catch(() => false)) ? field : address;
    await target.click();
    await typeSlowly(target, ADDRESS);
    await stage.hold(1.2);
  });

  await stage.beat('whichWorkspace', async () => {
    await pickFromSelect(page, /workspace|space|No workspace/i, 'Halstead Depot').catch(() => {});
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
