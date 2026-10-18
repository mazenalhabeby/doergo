"use client"

import type { ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

/*
  THE toggle chip (docs/design/ui-pieces/variants.md §3), two shapes only:
  `pill` for small choices in a row (filters, reasons, kinds), `iconPill` for a
  bigger choice, usually with an icon. On = primary border, tint and text;
  off = a quiet border. A choice of two, one always chosen, is a `Segmented`.
*/
const VARIANTS = {
  pill: {
    base: "rounded-full border px-2.5 py-1 text-xs transition-colors",
    on: "border-primary bg-primary/10 text-primary",
  },
  iconPill: {
    base: "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    on: "border-primary bg-primary/10 text-primary",
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
