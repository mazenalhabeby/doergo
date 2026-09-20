/**
 * What every web flow does the same way.
 *
 * Thirty-six videos drive the same application, and the first one proved that
 * three of the four ways to move around it are wrong in ways that never fail a
 * run — a silent no-op, a splash screen mid-sentence, a form that 403s and
 * renders blank. Left in each flow those mistakes get copied, because the next
 * flow starts as a copy of the last.
 *
 * So the way around the app lives here, once, and a flow is left holding only
 * what is particular to its own story.
 */

import type { Locator, Page } from '@playwright/test';
import { WEB_URL } from '../config.ts';

/** What `installScroller` puts on every document. */
interface PageWithScroller extends Window {
  scroller(): Element;
}

/**
 * Sign in, and be ready.
 *
 * Deliberately NOT a beat: signing in is not part of any story here, and a
 * cold route compile must not be charged to the first sentence of narration.
 */
export async function signIn(
  page: Page,
  login: { email: string; password: string },
): Promise<void> {
  await page.goto(`${WEB_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor({ state: 'visible' });
  await page.fill('#login-email', login.email);
  await page.fill('#login-password', login.password);
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await page.locator('[data-tour="dash-spaces"]').waitFor({ state: 'visible', timeout: 60_000 });
  await installScroller(page);
}

/**
 * Teach every document how to scroll itself.
 *
 * ⚠️ `window.scrollBy` DOES NOTHING IN THIS APP AND FAILS SILENTLY. The
 * dashboard layout puts the content area inside its own `flex-1 overflow-auto`
 * pane, so the window never scrolls — the page sits still while the narration
 * describes something further down. The first take of video 01 was twelve
 * beats of motionless screens for exactly this reason, and nothing in the log
 * said so.
 *
 * `addInitScript` rather than a per-beat helper: it runs before the app's own
 * code on every document, so nothing has to remember to re-install it.
 */
export async function installScroller(page: Page): Promise<void> {
  /*
    ⚠️ HIDE THE DEV OVERLAY, on every document.

    `next dev` renders its own indicator into a `<nextjs-portal>` element —
    the small badge in the corner. It appeared in the corner of EVERY frame of
    the first fourteen videos before anybody noticed, which on a published
    product video reads as a screenshot somebody forgot to clean up.

    It is worse than cosmetic: its buttons are real buttons in the page, and a
    loose selector reaches them. `button:has(svg)` matched the dev menu rather
    than a row's own menu, and the flow then opened "Try Turbopack" while the
    narration talked about approving a day off.
  */
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement('style');
      style.textContent =
        'nextjs-portal, #__next-build-watcher, [data-nextjs-toast] { display: none !important; }';
      document.head?.appendChild(style);
    };
    if (document.head) hide();
    else addEventListener('DOMContentLoaded', hide);
  });
  await page.addInitScript(() => {
    (window as unknown as { scroller: () => Element }).scroller = () => {
      const pane = document.querySelector('.flex-1.overflow-auto');
      if (pane && pane.scrollHeight > pane.clientHeight + 40) return pane;
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
}

/** Scroll the app, smoothly, and wait for it to settle. */
export async function scrollBy(page: Page, distance: number): Promise<void> {
  await page.evaluate(
    (d) => (window as unknown as PageWithScroller).scroller().scrollBy({ top: d, behavior: 'smooth' }),
    distance,
  );
  await page.waitForTimeout(900);
}

export async function scrollTop(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as PageWithScroller).scroller().scrollTo({ top: 0, behavior: 'smooth' }),
  );
  await page.waitForTimeout(700);
}

/**
 * Bring one named panel into view and rest on it.
 *
 * Preferred over a distance for anything the narration NAMES. A distance is a
 * guess about a layout that changes, and the failure is silent: the sentence
 * plays over whatever happened to be at that offset.
 */
export async function reveal(page: Page, selector: string, restSec = 1.1): Promise<void> {
  const panel = page.locator(selector).first();
  await panel.waitFor({ state: 'visible', timeout: 20_000 });
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(Math.round(restSec * 1000));
}

/**
 * The card, row or panel carrying a given name.
 *
 * Relational because there is often nothing else to hold on to: list items
 * carry no id, and the one tour anchor on a list sits on whichever item
 * renders first — which is not the one the narration means.
 */
export function itemFor(page: Page, container: string, name: string): Locator {
  return page.locator(container).filter({ hasText: name }).first();
}

/** A workspace card on /locations. */
export function spaceCard(page: Page, name: string): Locator {
  return itemFor(page, 'div.rounded-xl.border.bg-card', name);
}

/**
 * Where the top navigation goes, by the anchor that gets there.
 *
 * ⚠️ NEVER `page.goto` INSIDE A BEAT. A goto is a hard navigation: the app
 * unmounts, re-boots, and shows its dark BootScreen while auth re-hydrates —
 * several seconds of an almost-black screen in the middle of a sentence, and
 * then a screen that has not finished loading. Clicking is a client-side route
 * change, and it also shows the viewer where the screen lives.
 *
 * Some entries are two clicks because the product puts them behind a menu.
 */
export const NAV = {
  dashboard: ['[data-tour="nav-dashboard"]'],
  tasks: ['[data-tour="nav-tasks"]'],
  spaces: ['[data-tour="nav-spaces"]'],
  members: ['[data-tour="nav-team"]', 'a[href="/members"]'],
  invitations: ['[data-tour="nav-team"]', 'a[href="/invitations"]'],
  joinRequests: ['[data-tour="nav-team"]', 'a[href="/join-requests"]'],
  settings: ['[data-tour="nav-profile"]', 'a[href="/settings"]'],
  invoices: ['[data-tour="nav-invoices"]'],
  reports: ['[data-tour="nav-reports"]'],
  documents: ['[data-tour="nav-documents"]'],
} as const;

export type NavKey = keyof typeof NAV;

/** Click through to a screen and wait for something on it. */
export async function goTo(
  stage: { click(target: string | Locator): Promise<void> },
  page: Page,
  key: NavKey,
  settleOn: string,
): Promise<void> {
  for (const step of NAV[key]) await stage.click(step);
  await page.locator(settleOn).first().waitFor({ state: 'visible', timeout: 45_000 });
}

/*
  ── Dialogs and forms ──────────────────────────────────────────────────────
  Verified against the New Task dialog, and true of every dialog in the app:
  it is Radix, it is sectioned, and both facts break the obvious approach.
*/

export const DIALOG = '[role="dialog"]';

/*
  ⚠️ `:has-text()` IS A SUBSTRING MATCH, and this app is full of near-misses:
  a "Roles" button beside an "All Roles" filter, a "Save" beside "Save draft".
  Use `:text-is()` whenever the shorter string is a prefix of a longer one on
  the same screen — the failure is a click that lands somewhere plausible and
  a wait that then times out thirty seconds later on something unrelated.
*/

/**
 * THE dialog, told apart from every other thing that carries `role="dialog"`.
 *
 * ⚠️ RADIX GIVES POPOVERS `role="dialog"` TOO. A date popover, a command
 * palette and the form itself all match `[role="dialog"]`, so
 * `waitFor({ state: 'hidden' })` on the bare selector waits on whichever
 * matched first — which, after the create form closed cleanly, was an empty
 * leftover that never goes away. The job HAD been created; the flow failed
 * anyway, reporting a timeout on a selector rather than anything true.
 *
 * Name the dialog by something only it contains.
 */
export function dialogWith(marker: string): string {
  return `${DIALOG}:has(${marker})`;
}

/**
 * Open one of a dialog's collapsed sections.
 *
 * ⚠️ A CONTROL INSIDE A CLOSED SECTION IS NOT IN THE DOM. Reaching for it
 * directly waits the full timeout for an element that was never going to
 * appear — which is how the first cut of the job flow failed, 45 seconds at a
 * time. The section headers are plain buttons carrying their own name.
 */
export async function openSection(page: Page, name: string | RegExp): Promise<void> {
  const button = page.locator(`${DIALOG} button`).filter({ hasText: name }).first();
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await button.click();
  await page.waitForTimeout(600);
}

/**
 * Choose a value from one of the app's dropdowns.
 *
 * ⚠️ THESE ARE NOT `<select>` ELEMENTS. They are Radix listboxes: the trigger
 * is a `button[role="combobox"]` carrying either its placeholder or its current
 * value, and the options render in a PORTAL at the end of the body — OUTSIDE
 * the dialog — so a locator scoped to the dialog finds the trigger and never
 * the option.
 *
 * The trigger is matched on TEXT because these forms carry no ids and their
 * labels are translated at runtime. Pass a pattern covering the placeholder,
 * since a field arriving pre-filled shows its value instead.
 */
export async function pickFromSelect(
  page: Page,
  trigger: RegExp,
  option: string,
  scope = DIALOG,
): Promise<void> {
  const button = page.locator(`${scope} button[role="combobox"]`).filter({ hasText: trigger }).first();
  await button.scrollIntoViewIfNeeded();
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await button.click();

  const choice = page.getByRole('option').filter({ hasText: option }).first();
  await choice.waitFor({ state: 'visible', timeout: 20_000 });
  await choice.click();
  // The listbox unmounts on select; the next field is not clickable until it has.
  await page.getByRole('option').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
}

/**
 * Type at something like a person's speed.
 *
 * `fill()` sets the value in one frame, which on video reads as a paste — and
 * in a search box it skips every intermediate query, so the list never visibly
 * narrows, which is the whole point of that shot.
 */
export async function typeSlowly(target: Locator, text: string): Promise<void> {
  await target.pressSequentially(text, { delay: 45 });
}

/**
 * Scroll with the wheel, at something like the speed a person scrolls.
 *
 * The alternative to `scrollBy` above, and the more robust of the two: a wheel
 * event goes to whatever is under the pointer, so it needs no knowledge of
 * which container scrolls. Use `scrollBy` when the pointer may be somewhere
 * that does not scroll.
 */
export async function wheel(page: Page, distance: number): Promise<void> {
  const steps = 26;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(27);
  }
}

/**
 * Save a dialog and wait for the server to have taken it.
 *
 * ⚠️ THE DIALOG CLOSING IS THE ONLY HONEST SIGNAL. A validation error or a
 * rejected field leaves it open with a message — and a flow that pressed on
 * regardless would film the next beat over a dialog nobody dismissed.
 */
export async function saveDialog(page: Page, saveSelector: string): Promise<void> {
  await page.locator(saveSelector).first().click();
  await page.locator(DIALOG).waitFor({ state: 'hidden', timeout: 30_000 });
}

/**
 * Open a tab and prove it opened.
 *
 * ⚠️ A TAB TRIGGER IS VISIBLE WHETHER OR NOT ITS PANEL IS OPEN, so waiting on
 * the trigger proves nothing — the member page filmed two beats of its
 * Overview tab under a narration about access, because the click had gone
 * astray and every wait still passed. Wait for something only the PANEL has,
 * and press again if the first press did not take.
 */
export async function openTab(
  stage: { click(target: string | Locator): Promise<void> },
  page: Page,
  trigger: string,
  panelMarker: string,
): Promise<void> {
  await stage.click(trigger);
  const panel = page.locator(panelMarker).first();
  if (await panel.isVisible({ timeout: 4_000 }).catch(() => false)) return;
  await page.locator(trigger).first().click();
  await panel.waitFor({ state: 'visible', timeout: 20_000 });
}
