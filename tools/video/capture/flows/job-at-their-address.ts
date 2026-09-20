/**
 * "A job at a client's address" — video 23.
 *
 * ⚠️ THE CLIENT PICKER IS CONDITIONAL. The dialog renders it only where the
 * chosen workspace runs the CRM module; the depot does, and the dialog arrives
 * already set to it. An organisation whose default workspace has no client
 * book would see nothing here, with nothing on screen to say why.
 *
 * ⚠️ THE PICKER AND THE SITE ARE TWO CONTROLS. Choosing the client offers its
 * addresses; the dialog then says plainly whether the chosen one has a point
 * on the map, because that is the difference between a route and a straight
 * line.
 */

import { ADMIN_LOGIN } from '../../config.ts';
import { openStage } from '../runner.ts';
import { DIALOG, dialogWith, goTo, openSection, pickFromSelect, scrollBy, signIn, wheel } from '../screen.ts';
import type { Timeline } from '../../timeline.ts';

const CLIENT = 'Wrenfield Care Homes';
const JOB = 'Nurse call system — two points dead on the first floor';
const BOARD = '[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]';

export async function captureJobAtTheirAddress(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'job-at-their-address' });
  const { page } = stage;

  await signIn(page, ADMIN_LOGIN);
  await goTo(stage, page, 'tasks', '[data-tour="tasks-create"]');
  await page.locator(BOARD).first().waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  await stage.beat('aJobForSomebody', async () => {
    await stage.click('[data-tour="tasks-create"]');
    await page.locator(DIALOG).waitFor({ state: 'visible', timeout: 20_000 });
    await stage.type('[data-tour="tasks-dialog-title"]', JOB);
  });

  await stage.beat('thePicker', async () => {
    await openSection(page, 'Location');
    await scrollBy(page, 160);
    await stage.hold(1.4);
  });

  await stage.beat('theAddressComes', async () => {
    await pickFromSelect(page, /No client|Client to visit|client/i, CLIENT);
    await page.waitForTimeout(900);
    await stage.hold(1.6);
  });

  await stage.beat('theyCanDriveToIt', async () => {
    /*
      ⚠️ THE DIALOG SAYS THE ADDRESS HAS NO MAP POINT, in amber, the moment a
      seeded client is chosen — and the narration used to claim the opposite
      ("a point on a map, not a line of text") right over it. The sentence now
      describes the note and the map beneath it, which is what the screen
      actually offers. Give the seeded clients coordinates and the note goes;
      the line stays true either way.
    */
    await stage.moveTo('text=/no map point yet/i');
    await scrollBy(page, 180);
    await stage.hold(1.6);
  });

  await stage.beat('andTheHistory', async () => {
    await stage.click('[data-tour="tasks-dialog-save"]');
    const form = dialogWith('[data-tour="tasks-dialog-title"]');
    try {
      await page.locator(form).waitFor({ state: 'hidden', timeout: 30_000 });
    } catch {
      const said = (await page.locator(form).innerText().catch(() => '')).slice(0, 400);
      throw new Error(`The job was not created. The dialog still says:\n${said}`);
    }
    await page.getByText(JOB, { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    await stage.hold(1.4);
  });

  await stage.beat('whereNext', async () => {
    await wheel(page, 220);
    await stage.hold(1.2);
  });

  return stage.finish();
}
