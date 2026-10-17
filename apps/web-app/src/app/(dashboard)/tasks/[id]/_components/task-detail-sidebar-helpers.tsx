"use client"

import { type LucideIcon } from "lucide-react"

/** TaskDetailSidebar's module-level helpers, moved here unchanged so its sections can read them too. */
export function SidebarRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm text-foreground min-w-0 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
