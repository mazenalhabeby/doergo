"use client"

import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * One accent color per section. Values are tailwind token pairs so both light
 * and dark modes look right (no raw hex). `chip` colors the rounded icon square.
 */
export type SectionAccent = "primary" | "blue" | "indigo" | "violet" | "emerald" | "amber" | "sky"

const ACCENT_CHIP: Record<SectionAccent, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300",
}

/**
 * Consistent section header used across every space-settings tab: a colored
 * icon chip + title + one-line muted description, with an optional trailing
 * slot (usually the primary "New …" action).
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  accent = "primary",
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  accent?: SectionAccent
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-3 min-w-0">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ACCENT_CHIP[accent])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground leading-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/**
 * Polished empty state: a large muted icon chip, heading, hint, and an optional
 * primary action — replaces the bare "no items yet" text blocks.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
