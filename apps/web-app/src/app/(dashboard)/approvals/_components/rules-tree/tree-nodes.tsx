"use client"

import type { ReactNode } from "react"
import type { IconName } from "@hbcfield/shared/client"
import { Icon } from "@/components/ui/icon"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/** "None chosen" in a Select (Radix refuses an empty value). */
export const NONE = "__none__"

/** The pill a value sits in, inside the tree — a select trigger or the limit field. */
export const LIMIT =
  "h-8 rounded-full border-0 bg-shell-accent-soft px-3 text-[13.5px] font-semibold text-shell-accent outline-none " +
  "focus-visible:ring-2 focus-visible:ring-ring placeholder:font-medium placeholder:text-muted-foreground"

/** A box of the tree: a card with an optional icon well; `bad` rings it when it cannot work. */
export function TreeNode({
  children,
  icon,
  wide,
  bad,
  className,
}: {
  children: ReactNode
  icon?: IconName
  wide?: boolean
  bad?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-2xl border bg-card px-3.5 py-3 shadow-shell",
        wide ? "w-full flex-col" : "min-w-[280px] max-w-full items-center",
        icon && wide && "flex-row items-center",
        bad ? "border-shell-crit" : "border-border",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-shell-accent-soft text-shell-accent"
        >
          <Icon name={icon} size={16} />
        </span>
      )}
      {children}
    </div>
  )
}

/** One line of a rule: a soft word, then its value. */
export function TreeLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** A value to pick, drawn as the tree's pill. */
export function ChoiceSelect({
  value,
  onChange,
  choices,
  label,
  bad,
}: {
  value: string
  onChange: (v: string) => void
  choices: { value: string; label: string }[]
  label: string
  bad?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          LIMIT,
          "w-auto max-w-full gap-1.5 shadow-none",
          bad && "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The short line joining two boxes. */
export const Stem = () => <span aria-hidden className="h-5 w-0.5 shrink-0 bg-[hsl(var(--muted-foreground)/0.35)]" />

const DONE =
  "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold shadow-shell"

/** Where a branch ends. */
export function DoneNode({ children }: { children: ReactNode }) {
  return (
    <span className={DONE}>
      <span aria-hidden className="size-2 rounded-full bg-shell-accent" />
      {children}
    </span>
  )
}
