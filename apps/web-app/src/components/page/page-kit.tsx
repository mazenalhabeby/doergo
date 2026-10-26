import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/*
  The pieces every page of the redesign repeats (docs/design/web-redesign boards), drawn ONCE: the page header,
  the panel a page's columns sit in, a group's label, a notice line, a chip, a count and a fact row. Pages compose
  these; they never re-type the classes. Colours are the theme tokens (html.app-theme) and shell-* only.
*/

/** The page title row: a 30px title, one line saying what the page is for, and the page's actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  tour,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** The guided tour's anchor on the title. */
  tour?: string
  className?: string
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end gap-3.5", className)}>
      <div className="mr-auto flex min-w-0 flex-col gap-1.5">
        <h1 data-tour={tour} className="text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        {subtitle && <p className="max-w-[720px] text-[14.5px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A column of a page: the white card with the design's corner, line and shadow. */
export function Panel({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode
  className?: string
  as?: "section" | "aside" | "nav" | "div"
}) {
  return (
    <Tag className={cn("min-w-0 rounded-[22px] border border-border bg-card p-2.5 shadow-shell", className)}>
      {children}
    </Tag>
  )
}

/** The small capital label over a group of rows — coral when the group cannot wait. */
export function GroupLabel({
  children,
  tone = "soft",
  className,
}: {
  children: ReactNode
  tone?: "soft" | "crit"
  className?: string
}) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.04em]",
        tone === "crit" ? "text-shell-crit" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </h2>
  )
}

const NOTICE = {
  accent: "bg-shell-accent-soft text-foreground [&>svg]:text-shell-accent",
  warn: "bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn",
  crit: "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit",
} as const

/** One line the page wants you to know (covering for someone, a part that could not load). */
export function Notice({
  children,
  tone = "accent",
  className,
}: {
  children: ReactNode
  tone?: keyof typeof NOTICE
  className?: string
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm [&>svg]:size-4 [&>svg]:shrink-0",
        NOTICE[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}

const CHIP = {
  soft: "bg-shell-chip text-muted-foreground",
  accent: "bg-shell-accent-soft text-shell-accent",
  warn: "bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn",
  crit: "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit",
} as const

/** A short label in a pill (a kind, a state, a reason); `dot` puts a coloured dot before the words. */
export function Chip({
  children,
  tone = "soft",
  dot = false,
  className,
}: {
  children: ReactNode
  tone?: keyof typeof CHIP
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        CHIP[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** A number in a pill beside a row: coral when something cannot wait, amber when it waits, grey otherwise. */
export function Count({ n, tone = "soft" }: { n: number; tone?: "soft" | "warn" | "crit" }) {
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
        tone === "crit" && "bg-shell-crit text-white",
        tone === "warn" && "bg-shell-warn text-shell-on-warn",
        tone === "soft" && "bg-shell-chip text-muted-foreground",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  )
}

/** One fact of a record: the label on the left, the value on the right, a hairline between rows. */
export function FactRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: "warn" | "crit" }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border py-2.5 text-sm first:border-t-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-right font-semibold text-foreground [overflow-wrap:anywhere]",
          tone === "warn" && "text-shell-warn",
          tone === "crit" && "text-shell-crit",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/** A list row of a page: the hover, the chosen state and the 14px corner every list in the boards shares. */
export const ROW =
  "flex w-full items-start gap-3 rounded-[14px] p-3 text-left outline-none transition-colors " +
  "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-shell-nav-on"

/** The rail of a page (filters / kinds): a 40px row per entry. */
export const RAIL_ROW =
  "flex h-10 w-full shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-sm outline-none transition-colors " +
  "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-shell-nav-on " +
  "aria-[current=true]:font-semibold aria-[current=true]:text-shell-nav-on-ink"
