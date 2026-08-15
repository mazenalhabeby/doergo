"use client"

import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * One accent color per section. Values are tailwind token pairs so both light
 * and dark modes look right (no raw hex). `chip` colors the rounded icon square.
 */
export type SectionAccent = "primary" | "blue" | "indigo" | "violet" | "emerald" | "amber" | "sky"

/**
 * Consistent section header used across every space-settings tab: title +
 * one-line muted description, with an optional trailing slot (usually the
 * primary "New …" action). No icon chip — the section headers stay flat to
 * match the rest of the page. `icon`/`accent` are accepted but ignored (kept so
 * existing call sites don't need touching).
 */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  accent?: SectionAccent
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground leading-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
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
