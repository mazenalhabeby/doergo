import { cn } from "@/lib/utils"

/*
  The Time board's own marks (docs/design/web-redesign/Time.dc.html), stated once for the Time pages —
  attendance, schedule, overtime and issues — so no page re-types a tint. Theme and shell-* tokens only.
*/

/** A calm amber tint with its ink — "waits", "late", "asked". */
export const WARN_SOFT = "bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn"
/** A coral tint with its ink — "cannot wait", "missed", "refused". */
export const CRIT_SOFT = "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit"
/** The jade tint with its ink — "fine", "approved", "working". */
export const ACCENT_SOFT = "bg-shell-accent-soft text-shell-accent"

/** The pill tab bar (Radix TabsList): a grey track, the chosen tab a white pill. */
export const PILL_TABS = "h-auto flex-wrap justify-start gap-0.5 rounded-full bg-shell-chip p-1"
/** One tab of {@link PILL_TABS} (Radix TabsTrigger). */
export const PILL_TAB =
  "h-[38px] gap-1.5 rounded-full px-4 text-sm font-medium text-muted-foreground shadow-none " +
  "data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground " +
  "data-[state=active]:shadow-shell"

/** A small segmented switch (plain buttons): the track… */
export const SEG = "inline-flex flex-wrap gap-0.5 rounded-full bg-shell-chip p-1"
/** …and one of its buttons, chosen or not. */
export function segButton(on: boolean, className?: string) {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium text-muted-foreground transition",
    on ? "bg-card font-semibold text-foreground shadow-shell" : "hover:text-foreground",
    className,
  )
}

/** The board's round icon button (previous / next / close). */
export const ROUND_ICON =
  "grid size-[34px] shrink-0 place-items-center rounded-full bg-shell-chip text-foreground transition " +
  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45"

/** A day off that is ASKED, not yet decided: amber stripes (the wallchart's bars and its legend). */
export const PENDING_STRIPES =
  "bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--shell-warn)_20%,transparent)_0_4px," +
  "color-mix(in_srgb,var(--shell-warn)_36%,transparent)_4px_8px)]"
