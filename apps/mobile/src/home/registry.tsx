import React from 'react';
import type { Requires } from './entitlement';
import { meets } from './entitlement';
import type { User } from '../lib/api/types';

import { ShiftClockCard } from '../components/home/shift-clock-card';
import { ShortcutsRail } from '../components/home/shortcuts-rail';
import { DocumentsReminderCard } from '../components/documents-reminder-card';
import { MyWorkCard } from '../components/home/my-work-card';

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
 */
export interface WidgetRow {
  key: string;
  /** An i18n key, never a sentence. */
  title: string;
  requires?: Requires;
  Component: React.ComponentType<{ style?: object }>;
  /**
   * What an empty answer means — a DECISION, not an absence.
   *
   *   hidden      normal, nothing to report
   *   invitation  something is here but has not been set up
   *   allClear    the answer is genuinely "nothing, and that is good"
   */
  empty: 'hidden' | 'invitation' | 'allClear';
}

export const WIDGETS: WidgetRow[] = [
  /*
    The shift clock — §3.1. About the viewer, so no permission.

    ⚠️ `module: 'clock'` and not `time_tracking`: the per-space billing modules
    have never been sent to the phone, and `clock` is what the four hard-coded
    homes already gated on. See `entitlement.ts`.
  */
  {
    key: 'shift-clock',
    title: 'widgets.shiftClock',
    requires: { module: 'clock', self: true },
    Component: ShiftClockCard,
    empty: 'hidden',
  },

  /*
    Documents needing you — §3.16. NO module and NO permission: everyone, about
    themselves. The gate is whether anything is outstanding, and that is
    content, not entitlement.

    ⚠️ The subject exemption is load-bearing. A document type restricted to
    other roles still shows a member what is required OF THEM — otherwise
    restricting a type leaves somebody unable to hand in their passport while a
    screen goes on chasing them for it.
  */
  {
    key: 'documents-due',
    title: 'widgets.documentsDue',
    requires: { self: true },
    Component: DocumentsReminderCard,
    empty: 'hidden',
  },

  /*
    My work — §3.2, §3.5 and §3.3 in one row.

    ⚠️ The entitlement is `tasks` OR `clock`, and the SHAPE follows which. It
    cannot be `tasks` alone: §3.2 said "Who: Everyone", so a member holding the
    clock and not tasks got a jobs card every day, forever, empty — "Nothing
    scheduled today" about work they will never be assigned. The registry
    cannot express OR on modules, so the row asks for neither and the
    component returns null for the member who holds neither.
  */
  {
    key: 'my-work',
    title: 'widgets.myWork',
    Component: MyWorkCard,
    empty: 'allClear',
  },

  /*
    Shortcuts — §3.27, absorbing messages, credentials and sync. It owns no
    gate of its own: every tile carries one, and the rail appears when two or
    more of them do.
  */
  {
    key: 'shortcuts',
    title: 'widgets.shortcuts',
    Component: ShortcutsRail,
    empty: 'hidden',
  },
];

/**
 * The order a member gets before they have touched anything.
 *
 * ⚠️ Not a "profile" branch per role. Role is a poor proxy for what somebody
 * DOES, and since 2026-07-16 it is barely a proxy at all — `Role` is only
 * `ADMIN | EMPLOYEE | CUSTOMER` and everything meaningful lives in an
 * `AccessRole`. Entitlement filters this list; it does not fork it.
 */
export const DEFAULT_ORDER: string[] = ['shift-clock', 'documents-due', 'my-work', 'shortcuts'];

/**
 * ENTITLEMENT IS ASKED ONCE, AND FILTERED LAST.
 *
 * One function feeds both the home screen and the picker. Asked separately
 * they drift — which is exactly how the clock-in list ended up stricter than
 * the clock-in check it mirrored, hiding two of three workspaces from a member
 * assigned to all three.
 */
export function availableWidgets(user: User | null | undefined): WidgetRow[] {
  return WIDGETS.filter((w) => meets(user, w.requires));
}

/**
 * The member's column: their saved order, then their hidden set, then
 * entitlement — in that order, every render.
 *
 * ⚠️ A STORED KEY THAT IS NO LONGER ALLOWED IS SKIPPED SILENTLY AND NEVER
 * DELETED FROM STORAGE, so a space reassignment that is later undone does not
 * destroy the layout. Hidden is not removed.
 */
export function composeHome(
  user: User | null | undefined,
  saved?: { keys?: string[] | null; hidden?: string[] | null } | null,
): WidgetRow[] {
  const allowed = new Map(availableWidgets(user).map((w) => [w.key, w]));
  const hidden = new Set(saved?.hidden ?? []);
  const order = saved?.keys?.length ? saved.keys : DEFAULT_ORDER;

  const seen = new Set<string>();
  const out: WidgetRow[] = [];
  for (const key of order) {
    if (seen.has(key) || hidden.has(key)) continue;
    seen.add(key);
    const w = allowed.get(key);
    if (w) out.push(w);
  }
  // A widget added to the registry after this member last saved a layout still
  // appears — at the end, where it cannot displace something they arranged.
  for (const w of allowed.values()) {
    if (!seen.has(w.key) && !hidden.has(w.key)) out.push(w);
  }
  return out;
}
