/**
 * "What HBCField is" — the vocabulary video, for `welcomeAdmin`.
 *
 * The only flow in the library that performs no task. It opens things and
 * moves on, because the job of these three minutes is that four words —
 * organisation, workspace, member, job — mean something concrete before any
 * other video uses them.
 *
 * ⚠️ IT WRITES NOTHING. Twelve beats, zero mutations: no toggle switched, no
 * field typed, no dialog saved. That is deliberate and worth keeping — it makes
 * this the one video that can be re-rendered any number of times without
 * re-seeding, which is exactly what you want while a narrator is still being
 * settled. A single stray click on a module toggle would silently change the
 * workspace every later beat is filmed against.
 *
 * ⚠️ THE JOB OPENED IN `theJobHolds` IS FURNISHED BY THE SEED — timeline,
 * conversation, parts, hours and two signatures (`seedOneJobInFull`). The
 * narration names all of them. Open a different job and the sentence describes
 * things that are not on screen, which is precisely the bug the first render of
 * the old attendance video shipped with. If the seed's STORY_JOB changes, this
 * constant changes with it.
 *
 * ⚠️ NOT ONE BEAT USES `page.goto`, AND THAT IS THE POINT. A goto is a hard
 * navigation: the app unmounts, re-boots, and shows its dark BootScreen while
 * auth re-hydrates. On camera that is several seconds of an almost-black screen
 * in the middle of a sentence — the first take of this video opened the
 * settings beat on it, and then on a form that had not finished loading, under
 * a narration about what the company signed up as. Clicking the product's own
 * navigation is a client-side route change: no re-boot, no splash, and the
 * viewer also learns where these screens live.
 *
 * ⚠️ Every wait is on a selector. Nothing waits on `networkidle` — the signed-in
 * app holds a Socket.IO connection open, so the network is never idle and such
 * a wait can only ever time out.
 */

import type { Locator, Page } from '@playwright/test';
import { ADMIN_LOGIN, WEB_URL } from '../../config.ts';
import { CLIENT_SITE, DEPOT } from '../../demo-data.ts';
import { openStage } from '../runner.ts';
import type { Timeline } from '../../timeline.ts';

/** The job the seed furnishes in full. Must match STORY_JOB in seed-video.ts. */
const STORY_JOB = 'Replace failed extract fan';

/** A member whose access profile is worth looking at. Seeded crew. */
const MEMBER = 'Priya Rhodes';

/**
 * Two capabilities the narration describes without naming.
 *
 * ⚠️ NEVER READ A MODULE'S LABEL ALOUD — an organisation renames these, and a
 * video that speaks the label is wrong the day they do. The narration says
 * "keeps track of vehicles" and "hours worked"; the cursor points at the rows
 * that happen to carry those names today.
 */
/** What `addInitScript` below puts on every document this flow opens. */
interface PageWithScroller extends Window {
  scroller(): Element;
}

const VEHICLES_ROW = 'label:has(#module-assets)';
const HOURS_ROW = 'label:has(#module-time_tracking)';

export async function captureWhatHbcfieldIs(
  narrationDurations: Record<string, number>,
): Promise<Timeline> {
  const stage = await openStage({ narrationDurations, videoId: 'what-hbcfield-is' });
  const { page } = stage;

  // ── Setup, before the clock starts ────────────────────────────────────────
  // Signing in is not part of this story and a cold route compile should not be
  // charged to the first sentence of narration.
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible' });
  /*
    ⚠️ THE OWNER, not the default recording account. This video's viewer is
    somebody who just signed their own company up, and beat 3 opens the
    organisation's own settings — which `GET /organizations/profile` serves to
    an ADMIN and refuses to anybody else. Signed in as the supervisor the panel
    still renders, empty, and the narration plays over a blank signup form.
  */
  await page.fill('#login-email', ADMIN_LOGIN.email);
  await page.fill('#login-password', ADMIN_LOGIN.password);
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await page.locator('[data-tour="dash-spaces"]').waitFor({ state: 'visible', timeout: 60_000 });

  /*
    Teach the page how to scroll itself, once, for every navigation.
    ⚠️ `addInitScript` rather than a helper called per beat: it runs before the
    app's own code on every document, so a beat that navigates does not have to
    remember to re-install it — forgetting would be another silently motionless
    beat.
  */
  await page.addInitScript(() => {
    (window as unknown as { scroller: () => Element }).scroller = () => {
      // The dashboard layout's own pane, which is what actually scrolls.
      const pane = document.querySelector('.flex-1.overflow-auto');
      if (pane && pane.scrollHeight > pane.clientHeight + 40) return pane;
      // Fallback: the tallest genuinely-scrollable box on the page.
      let best: Element | null = null;
      let bestOverflow = 40;
      for (const el of Array.from(document.querySelectorAll('div, main, section'))) {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
        const overflow = el.scrollHeight - el.clientHeight;
        if (overflow > bestOverflow) { best = el; bestOverflow = overflow; }
      }
      return best ?? document.scrollingElement ?? document.documentElement;
    };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-tour="dash-spaces"]').waitFor({ state: 'visible', timeout: 60_000 });
  await stage.hold(0.8);

  // ── 1. One organisation ───────────────────────────────────────────────────
  await stage.beat('oneCompany', async () => {
    await stage.moveTo('[data-tour="dash-spaces"]');
    await scrollSmoothly(page, 220);
    await toTop(page);
  });

  // ── 2. The four words ─────────────────────────────────────────────────────
  await stage.beat('fourWords', async () => {
    // Deliberately still. The four words land against one frame, and the four
    // beats that follow answer them in order.
    await stage.hold(0.6);
  });

  // ── 3. The organisation ───────────────────────────────────────────────────
  await stage.beat('theOrganisation', async () => {
    await stage.click('[data-tour="nav-profile"]');
    await stage.click('a[href="/settings"]');
    await page.locator('[data-tour="settings-general"]').waitFor({ state: 'visible', timeout: 45_000 });
    /*
      ⚠️ Wait for the company's own name to be IN the field, not merely for the
      panel to exist. The form mounts empty and fills a moment later, and a
      frame caught in between is an untouched signup form — which is the
      opposite of the sentence being spoken over it.
    */
    await page
      .locator('input[value*="Halstead"]')
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});
    await stage.hold(1.4);
    await scrollSmoothly(page, 180);
  });

  // ── 4. The workspaces ─────────────────────────────────────────────────────
  await stage.beat('theWorkspaces', async () => {
    await stage.click('[data-tour="nav-spaces"]');
    await page.locator('[data-tour="spaces-card"]').waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(1.0);
    // Down the three of them as they are named: a depot, a workshop, a client's site.
    await scrollSmoothly(page, 300);
  });

  // ── 5. A workspace is not a folder ────────────────────────────────────────
  await stage.beat('notAFolder', async () => {
    /*
      The depot is named, not indexed. `spaces-card-configure` exists only on
      the FIRST card, and the list does not order by the default workspace —
      so an indexed selector opens whichever workspace happens to sort first.
    */
    await stage.click(cardFor(page, DEPOT.name).locator('button:has-text("Configure")'));
    await stage.click('[role="tab"]:has-text("Modules")');
    await page.locator(VEHICLES_ROW).waitFor({ state: 'visible', timeout: 45_000 });
    await stage.moveTo(VEHICLES_ROW);
    await stage.hold(0.8);
    await stage.moveTo(HOURS_ROW);
    await stage.hold(0.6);
    await scrollSmoothly(page, 260);
  });

  // ── 6. Somebody else's premises ───────────────────────────────────────────
  await stage.beat('somebodyElsesSite', async () => {
    await stage.click('[data-tour="nav-spaces"]');
    await page.locator('[data-tour="spaces-card"]').waitFor({ state: 'visible', timeout: 45_000 });
    /*
      The client's site is the CUSTOMER-kind workspace, and its own badge makes
      the point without a word of narration — so the cursor rests on the badge
      rather than on the name.
    */
    await stage.moveTo(cardFor(page, CLIENT_SITE.name));
    await stage.hold(1.6);
  });

  // ── 7. The people ─────────────────────────────────────────────────────────
  await stage.beat('thePeople', async () => {
    await stage.click('[data-tour="nav-team"]');
    await stage.click('a[href="/members"]');
    await page.locator('[data-tour="members-search"]').waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(1.0);
    await scrollSmoothly(page, 320);
  });

  // ── 8. Roles you build ────────────────────────────────────────────────────
  await stage.beat('rolesYouBuild', async () => {
    await stage.click(`button:has-text("${MEMBER}")`);
    await page.locator('[data-tour="page-member"]').waitFor({ state: 'visible', timeout: 45_000 });
    await stage.click('[data-tour="access-tab"]');
    /*
      ⚠️ Nothing is toggled here. A change on this tab is a real write against
      the seeded organisation, and the next take would start from different
      data than this one — a class of drift that is invisible until a later
      beat contradicts its own narration.
    */
    await stage.hold(1.6);
    await scrollSmoothly(page, 240);
  });

  // ── 9. The work ───────────────────────────────────────────────────────────
  await stage.beat('theWork', async () => {
    await stage.click('[data-tour="nav-tasks"]');
    await page
      .locator('[data-tour="tasks-board"], [data-tour="tasks-list"], [data-tour="tasks-schedule"]')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 });
    await stage.hold(1.2);
    await scrollSmoothly(page, 260);
    await toTop(page);
  });

  // ── 10. What a job holds ──────────────────────────────────────────────────
  await stage.beat('theJobHolds', async () => {
    // moveTo scrolls the card into view first, which matters on the board: the
    // finished work sits in a column that may be off to the right.
    await stage.click(`a:has-text("${STORY_JOB}")`);
    await page.locator('[data-tour="task-header"]').waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(0.9);
    /*
      The panels the sentence names, in the order it names them. Each is
      revealed by its own anchor rather than by a scroll distance — see reveal().
    */
    await reveal(page, '[data-tour="task-comments"]', 1.3);
    await reveal(page, '[data-tour="task-activity"]', 1.2);
    await reveal(page, '[data-tour="task-service-report"]', 1.6);
  });

  // ── 11. Two windows ───────────────────────────────────────────────────────
  await stage.beat('twoWindows', async () => {
    /*
      Narrated over the web app, not illustrated. The phone has its own videos
      and its own rig; a still photograph of a handset dropped in here would be
      the one frame in the library that is not the running product.
    */
    await stage.click('[data-tour="nav-dashboard"]');
    await page.locator('[data-tour="dash-spaces"]').waitFor({ state: 'visible', timeout: 45_000 });
    await stage.hold(1.6);
  });

  // ── 12. Where next ────────────────────────────────────────────────────────
  await stage.beat('whereNext', async () => {
    await stage.moveTo('[data-tour="nav-dashboard"]');
    await stage.hold(1.0);
  });

  return stage.finish();
}

/**
 * Scroll the signed-in app, smoothly, and wait for it to settle.
 *
 * ⚠️ `window.scrollBy` DOES NOTHING IN THIS APP AND FAILS SILENTLY. The
 * dashboard layout puts the whole content area inside its own
 * `flex-1 overflow-auto` pane, so the window never scrolls at all — the page
 * simply sits still while the narration describes something further down. The
 * first render of this video was twelve beats of motionless screens for
 * exactly this reason, and nothing in the log said so.
 *
 * ⚠️ `behavior: 'smooth'` and then a wait — not a jump. A jump cut in the
 * middle of a sentence reads as a dropped frame, and the viewer's eye loses
 * the place it had on the screen.
 */
async function scrollSmoothly(page: Page, distance: number): Promise<void> {
  await page.evaluate(
    (d) => (window as unknown as PageWithScroller).scroller().scrollBy({ top: d, behavior: 'smooth' }),
    distance,
  );
  await page.waitForTimeout(900);
}

async function toTop(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as PageWithScroller).scroller().scrollTo({ top: 0, behavior: 'smooth' }),
  );
  await page.waitForTimeout(700);
}

/**
 * The workspace card carrying a given name.
 *
 * Relational because there is nothing else to hold on to: the cards have no id
 * of their own and the one tour anchor on the list sits on whichever card
 * renders first.
 */
function cardFor(page: Page, name: string): Locator {
  return page.locator('div.rounded-xl.border.bg-card').filter({ hasText: name }).first();
}

/**
 * Bring one named panel into view and rest on it.
 *
 * Preferred over a distance for anything the narration NAMES: a distance is a
 * guess about a layout that changes, and the failure is silent — the sentence
 * plays over whatever happened to be at that offset. Playwright scrolls
 * whichever container actually scrolls, so this works regardless of the pane.
 */
async function reveal(page: Page, selector: string, restSec = 1.1): Promise<void> {
  const panel = page.locator(selector).first();
  await panel.waitFor({ state: 'visible', timeout: 20_000 });
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(Math.round(restSec * 1000));
}
