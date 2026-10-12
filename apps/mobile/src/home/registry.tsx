import type React from 'react';
import { ShiftClockCard } from '../components/home/shift-clock-card';
import { MyWorkCard } from '../components/home/my-work-card';
import { CrewCard } from '../components/home/crew-card';
import { ClientsCard } from '../components/home/clients-card';
import { ShortcutsCard } from '../components/home/shortcuts-card';
import { RouteCard } from '../components/home/route-card';
import { TodayCard } from '../components/home/today-card';
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
  /** Its surface OFF the home (the gallery). On the home, position decides: the first card is glass (amazen CardSurface). */
  surface: 'glass' | 'well';
  /**
   * Roughly how tall the card stands with an answer — the space held while its
   * FIRST answer is on the way (home-load `HomeCard`), so nothing below jumps.
   */
  restHeight?: number;
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
    restHeight: 200,
    title: 'widgets.shiftClock',
    question: 'widgets.q.shiftClock',
    requires: { module: 'clock', internal: true, self: true },
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
    restHeight: 280,
    title: 'widgets.myWork',
    question: 'widgets.q.myWork',
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
    restHeight: 300,
    title: 'widgets.crew',
    question: 'widgets.q.crew',
    requires: { permission: 'canViewSpaceAttendance' },
    surface: 'well',
    empty: 'hidden',
    Component: CrewCard,
  },
  /*
    Clients — `docs/design/clients`. What is owed today (reminders, finished
    from the row), what is going cold, and the way to the whole book.

    ⚠️ One read, `GET /customers/due`, narrowed on the server to the caller's
    CRM reach and to reminders that are THEIRS — not every rep's to-do list.
    Not `internal`: an external member given clients in their workspace sees
    that workspace's due list, which is all the server gives them.
  */
  {
    key: 'clients',
    restHeight: 220,
    title: 'widgets.clients',
    question: 'widgets.q.clients',
    requires: { spaceModule: 'crm', crm: true },
    surface: 'well',
    empty: 'allClear',
    Component: ClientsCard,
  },
  /*
    Shortcuts — `docs/design/shortcuts`. Four tiles the member chooses from
    every destination they may open (the one table, `manage-rows.ts`), with
    smart picks until they do. No request of its own.

    ⚠️ NO `requires`: the card counts what the table allows and draws nothing
    below two tiles.
  */
  {
    key: 'shortcuts',
    restHeight: 130,
    title: 'widgets.shortcuts',
    question: 'widgets.q.shortcuts',
    surface: 'well',
    empty: 'hidden',
    Component: ShortcutsCard,
  },
  /*
    Today's route — `docs/design/my-route`. The driving day, drawn (SVG, not a
    map), with the next stop lifted and an arrow per stop. No request of its
    own on opening; the plan and position are the phone's.

    ⚠️ `drives`: tracking in a workspace they are assigned to, jobs in their
    Access Profile, and not external — the same rule as the Plan route tile.
    Which stops are theirs today is the card's own rule (`isMyRouteStop`), and
    an empty day says so rather than vanishing.
  */
  {
    key: 'my-route',
    restHeight: 380,
    title: 'widgets.myRoute',
    question: 'widgets.q.myRoute',
    requires: { drives: true, self: true },
    surface: 'well',
    empty: 'allClear',
    Component: RouteCard,
  },
  /*
    Today — the calendar on the home screen (shared calendar/*): appointments, reminders and
    client follow-ups today, then a holiday, my leave and invitations waiting on me. Jobs stay on
    My work. About the viewer, no permission; an external member holds no calendar.
  */
  {
    key: 'today',
    restHeight: 240,
    title: 'widgets.today',
    question: 'widgets.q.today',
    requires: { internal: true, self: true },
    surface: 'well',
    empty: 'allClear',
    Component: TodayCard,
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
export const DEFAULT_ORDER: string[] = ['shift-clock', 'shortcuts', 'crew', 'my-work', 'today', 'clients'];

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
