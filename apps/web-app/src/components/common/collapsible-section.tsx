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

  // Start from the prop, then adopt the remembered state after mount. Reading
  // localStorage during render would make the server (which always sees
  // `defaultOpen`) and the client disagree — a hydration mismatch on any page
  // where a section had been collapsed.
  const [open, setOpen] = useState(defaultOpen)
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) setOpen(stored === "true")
    } catch {
      // Private mode / storage disabled — the prop default stands.
    }
  }, [storageKey])

  // Persist, but only choices the reader actually made.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      localStorage.setItem(storageKey, String(open))
    } catch {
      // Nothing to do — the section still works, it just won't be remembered.
    }
  }, [open, storageKey])

  /**
   * Mount the body only once the section has been opened, and keep it mounted
   * afterwards so reopening is instant.
   *
   * Collapsing is purely visual here (`grid-template-rows: 0fr`), so before
   * this every section's children mounted on page load and every one of their
   * queries fired — a collapsed Attachments panel still fetched its
   * attachments. A section nobody opens should cost nothing.
   */
  const [everOpened, setEverOpened] = useState(defaultOpen)
  useEffect(() => {
    if (open) setEverOpened(true)
  }, [open])

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
            {everOpened ? children : null}
          </div>
        </div>
      </div>
    </div>
  )
}
