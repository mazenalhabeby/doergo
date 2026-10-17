"use client"

import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

/*
  A toggle pill: on = primary border and tint, off = quiet border.

  Only the variants that were written out identically are here, each producing
  the exact class string its copies had (base, then on/off, then `className`),
  so the screens did not change. Other chip looks still live in their pages —
  docs/design/ui-pieces/variants.md lists them for one look the user chooses.
*/
const VARIANTS = {
  /** Small text pill (report builder: views, measures, groupings). */
  pill: {
    base: "rounded-full border px-2.5 py-1 text-xs transition-colors",
    on: "border-primary bg-primary/10 text-primary",
  },
  /** Pill with a leading icon (document control, logbook entry types). */
  iconPill: {
    base: "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    on: "border-primary bg-primary/10 text-foreground",
  },
} as const

const OFF = "border-border text-muted-foreground hover:text-foreground"

export function ChoiceChip({
  on,
  variant = "pill",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; variant?: keyof typeof VARIANTS }) {
  const v = VARIANTS[variant]
  // No default `type`: each call site passes what its copy had (inside a form, a missing type submits).
  return <button className={cn(v.base, on ? v.on : OFF, className)} {...props} />
}
