"use client"

import type { ReactNode } from "react"
import type { IconName } from "@hbcfield/shared/client"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/** "None chosen" in a Select (Radix refuses an empty value). */
export const NONE = "__none__"

/** The pill a value sits in inside an editor — a select trigger or the limit field. */
export const LIMIT =
  "h-9 rounded-full border-0 bg-shell-accent-soft px-3 text-[13.5px] font-semibold text-shell-accent outline-none " +
  "focus-visible:ring-2 focus-visible:ring-ring placeholder:font-medium placeholder:text-muted-foreground"

const NODE =
  "group flex w-[172px] shrink-0 flex-col gap-0.5 rounded-2xl border bg-card px-3.5 py-2.5 text-left shadow-shell " +
  "outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-shell-accent " +
  "focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-shell-accent data-[state=open]:ring-2 " +
  "data-[state=open]:ring-shell-accent-soft"

const DONE =
  "inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] " +
  "font-semibold shadow-shell"

/**
 * One step of a rule's chain (Freepik Spaces' node): a small card saying ONE thing. Clicking it opens
 * its editor beside it; nothing else is on the canvas, so a chain reads in one glance.
 */
export function FlowNode({
  icon,
  label,
  value,
  sub,
  bad,
  children,
}: {
  icon: IconName
  label: string
  value: ReactNode
  sub?: ReactNode
  bad?: boolean
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger className={cn(NODE, bad ? "border-shell-crit" : "border-border")}>
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          <Icon name={icon} size={14} />
          {label}
        </span>
        <span className={cn("truncate text-[14.5px] font-semibold", bad ? "text-shell-crit" : "text-foreground")}>
          {value}
        </span>
        {sub && <span className="line-clamp-2 text-[12px] leading-snug text-muted-foreground">{sub}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[300px] flex-col gap-3 rounded-2xl p-4 shadow-shell-pop">
        <b className="text-sm">{label}</b>
        {children}
      </PopoverContent>
    </Popover>
  )
}

/** The line joining two nodes, with the ports at each end. */
export function Connector() {
  return (
    <span aria-hidden className="relative flex w-6 shrink-0 items-center self-center">
      <span className="h-0.5 w-full bg-[hsl(var(--muted-foreground)/0.35)]" />
      <span className="absolute -left-1 size-2 rounded-full border-2 border-[hsl(var(--muted-foreground)/0.5)] bg-card" />
      <span className="absolute -right-1 size-2 rounded-full border-2 border-[hsl(var(--muted-foreground)/0.5)] bg-card" />
    </span>
  )
}

/** Where a chain ends. */
export function DoneNode({ children }: { children: ReactNode }) {
  return (
    <span className={DONE}>
      <span aria-hidden className="size-2 rounded-full bg-shell-accent" />
      {children}
    </span>
  )
}

/** A value to pick inside an editor. */
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
          "w-full gap-1.5 shadow-none",
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
