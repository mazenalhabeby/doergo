"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The inside of one choice in a workspace policy list (away-from-site, no
 * shift today): a radio dot, the title and its explanation, and a spinner
 * while the chosen one saves. Each section draws its own button around it.
 */
export function PolicyOptionContent({
  active,
  title,
  body,
  saving,
}: {
  active: boolean
  title: ReactNode
  body: ReactNode
  saving: boolean
}) {
  return (
    <>
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          active ? "border-primary" : "border-border",
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{body}</span>
      </span>
      {saving && active && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
    </>
  )
}
