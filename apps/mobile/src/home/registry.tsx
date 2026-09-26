import type React from 'react';
import { ShiftClockCard } from '../components/home/shift-clock-card';
import { MyWorkCard } from '../components/home/my-work-card';
import { CrewCard } from '../components/home/crew-card';
import { ClientsCard } from '../components/home/clients-card';
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
export const WIDGETS: WidgetRow[] = [
  /*
    The shift clock — `docs/design/shift-clock.md`. About the viewer, so no
    permission: everyone has their own clock.

    ⚠️ `module: 'clock'` AND NOT `time_tracking`. The per-space billing modules
    have never been sent to the phone — the login payload carries
    `enabledModules` and `orgModules` and no per-space list at all — and `clock`
    is time_tracking's mobile proxy, which is what the tab bar already gates on.
    Asking a different question here than `(tabs)/_layout.tsx` asks is how the
    navigation and the home screen end up disagreeing about the same member.

    ⚠️ GLASS. One of the three, and the clearest case for it: this is the card
    whose answer changes while you are looking at it.
  */
  {
    key: 'shift-clock',
    title: 'widgets.shiftClock',
    question: 'Am I on the clock, and when is my next rest?',
    requires: { module: 'clock', self: true },
    surface: 'glass',
    /*
      ⑧ of the eight is "not rendered" — a member with no workspace assignment
      has nothing to clock into. The CARD decides that, not the registry: it is
      a fact about the member's data, not about their entitlement, and it can
      change between renders.
    */
    empty: 'hidden',
    Component: ShiftClockCard,
  },
  /*
    My work — `docs/design/my-work/`. Today's jobs, this week and the next job
    in one row: a week strip that changes the list, and a first row that
    carries its decision.

    ⚠️ NO `requires`. The rule is `tasks` OR `clock`, which `Requires` cannot
    say; the CARD returns null for a member holding neither, below its hooks.
    Gating it on `tasks` alone would hide it from exactly the clock-only
    member the fold exists for.

    ⚠️ A WELL. It is a list, and a list over a gradient dies in sunlight.
  */
  {
    key: 'my-work',
    title: 'widgets.myWork',
    question: 'What am I doing today, and this week?',
    surface: 'well',
    empty: 'allClear',
    Component: MyWorkCard,
  },
  /*
    Crew — `docs/design/crew`. Who is on, shifts waiting and no-shows in one
    row. A tile means a decision; the unit (people or workspaces) is derived
    from how many workspaces the viewer's grant reaches.

    ⚠️ `canViewSpaceAttendance`, held anywhere — the server narrows every
    endpoint the card reads to the caller's own spaces.
  */
  {
    key: 'crew',
    title: 'widgets.crew',
    question: 'Who is on, who is late, and what is waiting?',
    requires: { permission: 'canViewSpaceAttendance' },
    surface: 'well',
    empty: 'hidden',
    Component: CrewCard,
  },
  /*
    Clients — `docs/design/clients`. What is owed today (reminders, finished
    from the row), what is going cold, and the way to the whole book.

    ⚠️ One read, `GET /customers/due`, narrowed on the server to the caller's
    CRM view and to reminders that are THEIRS — not every rep's to-do list.
  */
  {
    key: 'clients',
    title: 'widgets.clients',
    question: 'Who do I owe a call or an email today?',
    requires: { crm: true },
    surface: 'well',
    empty: 'allClear',
    Component: ClientsCard,
  },
];

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
export const DEFAULT_ORDER: string[] = ['shift-clock', 'crew', 'my-work', 'clients'];

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

/**
 * A stable empty column.
 *
 * ⚠️ A FRESH `[]` IS A NEW IDENTITY EVERY RENDER, and this one is handed to a
 * `FlatList` as `data` — which re-runs its whole diff, and to memo hooks,
 * which then cannot skip. One frozen array instead.
 */
export const EMPTY_ROWS: readonly WidgetRow[] = Object.freeze([]);

/**
 * A widget's name, in the member's language.
 *
 * ⚠️ ONE PLACE. `t(row.title, { defaultValue: row.key })` was written in four
 * files, and the fallback is the interesting half: a row whose i18n key has no
 * translation renders its KEY — `crew`, not `home.widgets.crew` — because a
 * raw dotted key on somebody's home screen looks like a crash, and the key
 * happens to be a readable word.
 */
export function widgetTitle(
  row: WidgetRow,
  /* `TFunction` is not imported here on purpose — the registry is data, and it
     should not depend on which i18n library the app happens to use. */
  t: (key: string, options: { defaultValue: string }) => string,
): string {
  return t(row.title, { defaultValue: row.key });
}
