"use client"

import { Check } from "lucide-react"
import { personInitials } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"

/**
 * One person in a pick list (an asset's holder, an apartment's resident):
 * initials, name, a second line, and a tick when chosen.
 */
export function PersonPickRow({
  name,
  sub,
  selected,
  onClick,
}: {
  name: string
  sub: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
        selected ? "bg-primary/10" : "hover:bg-muted",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
        {personInitials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="block text-[11px] text-muted-foreground">{sub}</span>
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}
