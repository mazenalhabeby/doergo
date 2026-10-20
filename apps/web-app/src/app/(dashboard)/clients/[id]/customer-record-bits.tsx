"use client"

import { useTranslation } from "react-i18next"
import { Check, ChevronDown } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { CUSTOMER_STAGES, customerStageLabel } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Truncated } from "@/components/truncated"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { stageDot } from "./customer-record-lib"

// ── Status pill (clean, Attio-style) ──────────────────────────────────────────
export function StatusPill(
  { current, onSet, pending, readOnly }: { current: string; onSet: (s: string) => void; pending: boolean; readOnly?: boolean }) {
  const { t } = useTranslation()
  // Somebody who may read the stage but not move it sees the stage, not a menu.
  if (readOnly) {
    return (
      <span
        className={"inline-flex items-center gap-2 rounded-full border border-border " +
          "bg-background px-3 py-1.5 text-sm font-medium text-foreground"}>
        <span className={cn("h-2 w-2 rounded-full", stageDot(current))} />
        {customerStageLabel(current)}
      </span>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending}>
        <button
          className={"inline-flex items-center gap-2 rounded-full border border-border " +
            "bg-background px-3 py-1.5 text-sm font-medium text-foreground " +
            "transition-colors hover:bg-muted disabled:opacity-60"}>
          <span className={cn("h-2 w-2 rounded-full", stageDot(current))} />
          {customerStageLabel(current)}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {CUSTOMER_STAGES.map((s) => (
          <DropdownMenuItem key={s.key} onClick={() => onSet(s.key)} className="gap-2">
            <span className={cn("h-2 w-2 rounded-full", stageDot(s.key))} />
            <span className="flex-1">{t(`customers.stageKey.${s.key.toLowerCase()}`, s.label)}</span>
            {s.key === current && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function IconBtn({ icon: Icon, href, label }: { icon: LucideIcon; href: string; label: string }) {
  return (
    <a
      href={href}
      title={label}
      className={"inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary/10 px-3 " +
        "text-xs font-medium text-primary transition-colors hover:bg-primary/20"}>
      <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
    </a>
  )
}
export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border/70 bg-card p-4">{children}</div>
}
export function PanelHead({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
}
/**
 * One label and one value, truncated to the panel's width.
 *
 * The value shows the whole of itself on hover when — and only when — it does
 * not fit. See `Truncated`; the rail is 300px wide and an email, a website or a
 * register number routinely runs past it.
 */
export function PropRow({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      {/*
        `flex-1 min-w-0`, not `min-w-0` alone.

        Without flex-1 the value sizes to its own text and only shrinks when the
        row runs out of room — so a value could sit at its full width, never
        clip, and the hover box correctly never appear while the text still ran
        past the panel. Filling the space left by the label is also what keeps
        the right edges of every value in the column aligned.
      */}
      <dd className="min-w-0 flex-1">
        <Truncated
          text={value}
          href={href}
          className={cn(
            "text-right font-medium text-foreground",
            href && "transition-colors hover:text-primary",
          )}
        />
      </dd>
    </div>
  )
}
