"use client"

import { ArrowDownLeft, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { ChoiceChip } from "@/components/ui/choice-chip"

/** AssetKindDialog's module-level helpers, moved here unchanged so its sections can read them too. */
/** One switchable part of the record. */
export function Row({
  icon: Icon,
  title,
  hint,
  checked,
  onChange,
  bare,
}: {
  icon: typeof MapPin
  title: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  bare?: boolean
}) {
  return (
    <div className={cn("flex items-start gap-3 p-3", !bare && "rounded-xl border border-border")}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** A two-state chip — members, clients, or both. */
export function Pick({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <ChoiceChip type="button" variant="iconPill" on={active} onClick={onClick}>
      {label}
    </ChoiceChip>
  )
}

/** In or out, for one money heading. */
export function DirBtn({
  active,
  onClick,
  icon: Icon,
  label,
  tone,
}: {
  active: boolean
  onClick: () => void
  icon: typeof ArrowDownLeft
  label: string
  tone: "in" | "out"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
        active
          ? tone === "in"
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

/** Typed once for the kind, or filled in per record. */
export function OwnerBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <ChoiceChip type="button" on={active} onClick={onClick}>
      {label}
    </ChoiceChip>
  )
}
