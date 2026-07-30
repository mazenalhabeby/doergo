/**
 * Guided-tour engine — types (React Native port of the web engine).
 *
 * A tour is pure DATA: an ordered list of steps that each point at a real UI
 * element (registered by a `target` key via `useTourTarget`) and show a
 * localized title/body. The engine renders the spotlight + tooltip; tours never
 * contain rendering logic (single-responsibility: content vs engine).
 */

/** How a step advances. */
export type TourStepAction =
  | 'next' // advance via the Next button
  | 'tap'; // user must tap the highlighted element (do-it-with-me)

export interface TourStep {
  /** The key the target View registered via `useTourTarget(key)` / <TourTarget>. */
  target: string;
  /** i18n key for the step title (under `tours.<tourId>.steps.<key>.title`). */
  titleKey: string;
  /** i18n key for the step body. */
  bodyKey: string;
  /** How the step advances (default 'next'). */
  action?: TourStepAction;
  /**
   * If set, the engine ensures the app is on this route before showing the step
   * (so a tour can walk across screens). Uses expo-router navigation.
   */
  route?: string;
  /**
   * Name of a registered ACTION to run when this step becomes active — used to
   * set the screen up for the step (e.g. switch a tab / open a sheet). Unlike
   * the web engine (which clicked a DOM node), RN registers a callback via
   * `useTourAction(name, fn)`; the engine invokes it on step entry.
   */
  enter?: string;
  /**
   * Mark a step whose target may not exist (conditionally-rendered content, e.g.
   * an empty list). The engine gives it a short grace period, then skips it
   * quickly instead of stalling the tour.
   */
  optional?: boolean;
  /** Extra spotlight padding in px (default 8). */
  padding?: number;
}

/** Context passed to a tour's `gate` so it can decide if it applies to the user. */
export interface TourGateContext {
  role: string;
  isAdmin: boolean;
  /** Access-Profile module (tasks/clock/time_off/create_task/manage/…). */
  hasModule: (module: string) => boolean;
  /** Org-level feature module (tracking/service_reports/…). */
  hasFeature: (feature: string) => boolean;
  canManageUsers: boolean;
  canCreateTasks: boolean;
}

export interface TourDef {
  /** Stable unique id (also the i18n namespace `tours.<id>`). */
  id: string;
  /** i18n key for the tour's human name (shown in the Help launcher). */
  titleKey: string;
  /** Ionicons icon name for the launcher. */
  icon: string;
  /** Predicate deciding whether this tour applies to the current user. */
  gate?: (ctx: TourGateContext) => boolean;
  /**
   * Route where this tour should auto-run once on first visit. Prefix-matches by
   * default; set `autoRunExact` to match the path exactly. Omit for tours that
   * only run from the Help launcher.
   */
  autoRunOn?: string;
  /** Match `autoRunOn` exactly (e.g. a list tour that must not fire on detail). */
  autoRunExact?: boolean;
  /** Ordered steps. */
  steps: TourStep[];
}

/** A measured rectangle in window coordinates. */
export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
