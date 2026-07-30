/**
 * Guided-tour engine — types.
 *
 * A tour is pure data: an ordered list of steps that each point at a real UI
 * element (by its `data-tour` key) and show a localized title/body. The engine
 * renders the spotlight + tooltip; tours never contain rendering logic.
 * (Single-responsibility: content vs engine are fully separated.)
 */

/** How a step advances. */
export type TourStepAction =
  | "next" // advance via the Next button
  | "click" // user must click the highlighted element (do-it-with-me)

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto"

export interface TourStep {
  /** The `data-tour` attribute value on the target element. */
  target: string
  /** i18n key for the step title (under `tours.<tourId>.steps.<i>.title`). */
  titleKey: string
  /** i18n key for the step body. */
  bodyKey: string
  /** How the step advances (default "next"). */
  action?: TourStepAction
  /** Preferred tooltip side (default "auto"). */
  placement?: TourPlacement
  /**
   * If set, the engine ensures the app is on this route before showing the step
   * (so a tour can walk across screens). Uses Next.js client navigation.
   */
  route?: string
  /**
   * `data-tour` key to programmatically click when this step becomes active — used
   * to set the screen up for the step (e.g. switch to the Board view before
   * spotlighting the board). Fires once on entry.
   */
  enter?: string
  /**
   * Mark a step whose target may not exist (conditionally-rendered content, e.g.
   * an empty board). The engine gives it a short grace period, then skips it
   * quickly instead of stalling the tour.
   */
  optional?: boolean
  /**
   * Include this step only if its target is present when the tour starts
   * (composition-aware). Unlike `optional` (which lets a target appear later via
   * `enter`/`route`/dialogs), a `dynamic` step is PRE-FILTERED out of the tour
   * entirely when its target isn't on screen at start — so the total count and
   * numbering reflect only what's actually shown. Use for top-level layout blocks
   * that are conditionally composed per role/access (spaces vs tasks vs panels).
   */
  dynamic?: boolean
  /** Extra spotlight padding in px (default 8). */
  padding?: number
}

/** Context passed to a tour's `gate` so it can decide if it applies to the user. */
export interface TourGateContext {
  role: string
  isAdmin: boolean
  hasModule: (module: string) => boolean
  hasPlanFeature: (feature: string) => boolean
  hasPermission: (perm: string) => boolean
}

export interface TourDef {
  /** Stable unique id (also the i18n namespace `tours.<id>`). */
  id: string
  /** i18n key for the tour's human name (shown in the Help launcher). */
  titleKey: string
  /** Lucide icon key for the launcher (see tour-icons). */
  icon: string
  /** Predicate deciding whether this tour applies to the current user. */
  gate?: (ctx: TourGateContext) => boolean
  /**
   * Route where this tour should auto-run once on first visit. Prefix-matches by
   * default (so `/tasks` also covers `/tasks/123`); set `autoRunExact` to match
   * the path exactly. Omit for tours that only run from the Help launcher.
   */
  autoRunOn?: string
  /** Match `autoRunOn` exactly (e.g. a list tour that must not fire on detail). */
  autoRunExact?: boolean
  /** Ordered steps. */
  steps: TourStep[]
}
