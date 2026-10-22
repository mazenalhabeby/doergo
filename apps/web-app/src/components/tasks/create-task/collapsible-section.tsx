"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// CollapsibleSection — compact accordion section for dialog
// ---------------------------------------------------------------------------
export function CollapsibleSection({
  icon: Icon,
  label,
  children,
  defaultOpen = false,
  indicator,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  defaultOpen?: boolean
  indicator?: string | null
  disabled?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen} disabled={disabled}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center w-full gap-2.5 px-3 py-2.5 rounded-lg border border-border/60 bg-card",
            "hover:bg-accent/50 transition-all duration-150 group text-left",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          <Icon className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <span className="text-sm font-medium text-foreground flex-1">{label}</span>
          {indicator && !open && (
            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full max-w-[180px] truncate">
              {indicator}
            </span>
          )}
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={"overflow-hidden data-[state=open]:animate-in " +
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 " +
          "data-[state=open]:fade-in-0 data-[state=closed]:slide-up-1 " +
          "data-[state=open]:slide-down-1"}>
        <div className="pt-2 pb-1 space-y-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
