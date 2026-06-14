"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const APPLE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

interface CollapsibleSectionProps {
  id: string
  icon: LucideIcon
  title: string
  count?: number | string
  defaultOpen?: boolean
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function CollapsibleSection({
  id,
  icon: Icon,
  title,
  count,
  defaultOpen = true,
  action,
  children,
  className,
}: CollapsibleSectionProps) {
  const storageKey = `task-section-${id}`

  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen
    const stored = localStorage.getItem(storageKey)
    return stored !== null ? stored === "true" : defaultOpen
  })

  // Persist open/closed state
  useEffect(() => {
    localStorage.setItem(storageKey, String(open))
  }, [open, storageKey])

  // Animate content height
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  return (
    <div className={cn("bg-card rounded-2xl border border-border shadow-sm overflow-hidden", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-2.5 px-5 py-3.5 text-left",
          "hover:bg-muted/40 transition-colors duration-150",
          "group",
        )}
      >
        <ChevronRight
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
          )}
          style={{ transitionTimingFunction: APPLE_EASE }}
        />
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {count != null && (
          <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md font-medium tabular-nums">
            {count}
          </span>
        )}
        {action && (
          <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {action}
          </span>
        )}
      </button>

      {/* Animated content */}
      <div
        ref={contentRef}
        className="grid transition-all duration-300"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transitionTimingFunction: APPLE_EASE,
        }}
      >
        <div ref={innerRef} className="overflow-hidden">
          <div className="px-5 pb-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
