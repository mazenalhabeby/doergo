import React from 'react';
import type { Requires } from './entitlement';
import { meets } from './entitlement';
import type { User } from '../lib/api/types';

import { ShiftClockCard } from '../components/home/shift-clock-card';
import { ShortcutsRail } from '../components/home/shortcuts-rail';
import { DocumentsReminderCard } from '../components/documents-reminder-card';
import { MyWorkCard } from '../components/home/my-work-card';
import { WidgetPlaceholder } from '../components/home/widget-placeholder';

/*
  ⚠️ FOUR WIDGETS ARE REGISTERED AND NOT BUILT — crew, needs-you, my-route and
  clients. They render an honest empty box that says so.

  They are here rather than absent because the thing being decided right now is
  the ARRANGEMENT, and an arrangement of four is not the arrangement of eight.
  Each placeholder carries the question its spec says it answers, which is the
  part worth reviewing while the layout is in play.

  ⚠️ Their `requires` are REAL, not placeholders. Entitlement is the half of
  this that is easiest to get wrong and hardest to see, so it is wired now:
  switch to a clock-only member and the right ones disappear.
*/
const placeholder = (title: string, question: string, height?: number) => {
  const C = ({ style }: { style?: object }) => (
    <WidgetPlaceholder title={title} question={question} height={height} />
  );
  C.displayName = `Placeholder(${title})`;
  return C;
};

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
   * The question this widget answers, in one line — taken from its folder in
   * `docs/design`.
   *
   * Shown in the picker, because a row labelled only "Crew" tells nobody
   * whether they want it on their home screen. It is plain English rather than
   * an i18n key on purpose while the set is being decided; it becomes a key
   * when the copy settles.
   */
  question?: string;
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
    question: 'Am I on the clock, and when is my next rest?',
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
    question: 'What do I still owe the office?',
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
    question: 'What am I doing today, and this week?',
    Component: MyWorkCard,
    empty: 'allClear',
  },

  /*
    Today's route — §3.4. About the viewer; needs the tracking module.
    ⚠️ Pins with no line between them means no routing engine is configured —
    the nearest-neighbour fallback returns an order and no geometry.
  */
  {
    key: 'my-route',
    title: 'widgets.myRoute',
    question: 'How many stops, how far, when am I back?',
    requires: { orgModule: 'tracking', self: true },
    Component: placeholder("Today's route", 'How many stops, how far, when am I back?', 96),
    empty: 'invitation',
  },

  /*
    Crew — §3.6/§3.7/§3.8 folded into one. Who is on site right now.
    ⚠️ A *now* question: never cached, and stale here is simply wrong.
  */
  {
    key: 'crew',
    title: 'widgets.crew',
    question: 'Who is on site right now?',
    requires: { permission: 'canViewSpaceAttendance' },
    Component: placeholder('Crew', 'Who is on site right now?', 96),
    empty: 'allClear',
  },

  /*
    Needs you — §3.14/§3.15/§3.19/§3.21 folded into one row.

    ⚠️ `anyOf` exists for exactly this: the card appears when the viewer holds
    any ONE of four unrelated grants, and each of its rows then appears
    independently. Four separate registry rows would each be absent most days —
    four things to keep consistent for a screen that shows one of them.
  */
  {
    key: 'needs-you',
    title: 'widgets.needsYou',
    question: 'Expenses, leave and requests waiting on me.',
    requires: { anyOf: ['canViewAllTasks', 'canManageAssets', 'canManageUsers'] },
    Component: placeholder('Needs you', 'Expenses, leave and requests waiting on me.', 110),
    empty: 'hidden',
  },

  /*
    Clients — §3.11.
    ⚠️ Cannot be built without `GET /crm/due`, which does not exist. See
    `docs/design/clients/ENDPOINT.md`, which ends with the honest alternative:
    if it is not going to be built, Clients is a badged tile in the rail.
  */
  {
    key: 'clients',
    title: 'widgets.clients',
    question: 'Who is due a call, and who is going cold?',
    requires: { orgModule: 'crm' },
    Component: placeholder('Clients', 'Who is due a call, and who is going cold?', 96),
    empty: 'hidden',
  },

  /*
    Shortcuts — §3.27, absorbing messages, credentials and sync. It owns no
    gate of its own: every tile carries one, and the rail appears when two or
    more of them do.
  */
  {
    key: 'shortcuts',
    title: 'widgets.shortcuts',
    question: 'Four doors to the screens I use most.',
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
export const DEFAULT_ORDER: string[] = [
  'shift-clock',
  'documents-due',
  'my-work',
  'needs-you',
  'crew',
  'my-route',
  'clients',
  'shortcuts',
];

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
