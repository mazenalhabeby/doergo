import type React from 'react';
import type { Requires } from './entitlement';
import { meets } from './entitlement';
import type { User } from '../lib/api/types';

/**
 * A WIDGET IS A REGISTRY ROW.
 *
 * Adding a widget is adding a row. Anyone can read this one file and know the
 * whole set, and that property is worth protecting more than any individual
 * widget in it — which is why `requires` is DATA and never a predicate. See
 * `entitlement.ts` for the argument in full.
 *
 * ⚠️ A LAYOUT IS AN ORDERED LIST OF KEYS. No coordinates, no grid, no per-cell
 * spans. One column, each widget at its natural height. A positioned grid is an
 * order of magnitude more work, worse on a phone, and can be corrupted into a
 * state that will not render. An ordered list cannot.
 *
 * ⚠️ THE SET IS EMPTY ON PURPOSE. The five widgets that were here are being
 * rebuilt one at a time; `git log` has them. Everything around this file — the
 * home column, edit-in-place, the drag, the gallery, entitlement, the saved
 * order — is finished and does not change when a row is added. That is the
 * point of the shape: a widget is a row, and adding one is adding a row.
 */
export interface WidgetRow {
  /** Stable, and never renamed — it is what a member's saved order holds. */
  key: string;
  /** An i18n key, never a sentence. */
  title: string;
  /**
   * The question this widget answers, in one line — taken from its folder in
   * `docs/design`. Shown in the gallery, because a page labelled only "Crew"
   * tells nobody whether they want it on their home screen.
   */
  question?: string;
  requires?: Requires;
  /**
   * ⚠️ GLASS ON THREE CARDS ONLY: shift clock, crew, clients.
   *
   * Everything else is a well. A list over a gradient is what dies in
   * sunlight, and glass is what the three cards that are ABOUT THE MOMENT get
   * to use — the ones whose answer changes while you are looking at it.
   *
   * It lives on the row rather than in the component so the set is readable in
   * one place; a component deciding its own surface is how a fourth one
   * appears.
   */
  surface: 'glass' | 'well';
  /**
   * What an empty answer means — a DECISION, not an absence.
   *
   *   hidden      normal, nothing to report
   *   invitation  something is here but has not been set up
   *   allClear    the answer is genuinely "nothing, and that is good"
   */
  empty: 'hidden' | 'invitation' | 'allClear';
  Component: React.ComponentType<{ style?: object }>;
}

/**
 * ⚠️ A WIDGET WHOSE COMPONENT IS A PLACEHOLDER IS NOT IN THIS FILE.
 *
 * Three rows once rendered a card that said **"not built yet"**. A registry row
 * is a promise that something renders; a member who reads that sentence on
 * their own home screen has been shown the project's to-do list. Register one
 * when it renders — the design's own check is "search the running app for
 * `not built yet`: zero results."
 */
export const WIDGETS: WidgetRow[] = [];

/**
 * The order a member gets before they have touched anything.
 *
 * ⚠️ Not a "profile" branch per role. Role is a poor proxy for what somebody
 * DOES, and since 2026-07-16 it is barely a proxy at all — `Role` is only
 * `ADMIN | EMPLOYEE | CUSTOMER` and everything meaningful lives in an
 * `AccessRole`. Entitlement filters this list; it does not fork it.
 *
 * ⚠️ EVERY KEY HERE MUST EXIST IN `WIDGETS`. A key that names nothing is
 * skipped silently, which is right for a member whose entitlement changed and
 * wrong for a typo — so `registry.spec.ts` fails on one.
 */
export const DEFAULT_ORDER: string[] = [];

/**
 * ENTITLEMENT IS ASKED ONCE, AND FILTERED LAST.
 *
 * One function feeds both the home screen and the gallery. Asked separately
 * they drift — which is exactly how the clock-in list ended up stricter than
 * the clock-in check it mirrored, hiding two of three workspaces from a member
 * assigned to all three.
 */
export function availableWidgets(user: User | null | undefined): WidgetRow[] {
  return WIDGETS.filter((w) => meets(user, w.requires));
}
