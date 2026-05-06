"use client"

import Link from "next/link"
import { LucideIcon, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface QuickAction {
  label: string
  description: string
  href: string
  icon: LucideIcon
}

interface QuickActionsProps {
  actions: QuickAction[]
  className?: string
}

export function QuickActions({ actions, className }: QuickActionsProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {actions.map((action, index) => {
        const Icon = action.icon

        return (
          <Link
            key={index}
            href={action.href}
            className={cn(
              "group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4",
              "transition-all duration-200",
              "hover:border-border hover:shadow-sm"
            )}
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-muted">
              <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-foreground">
                  {action.label}
                </span>
                <ArrowUpRight className="size-3 text-muted-foreground opacity-0 transition-all group-hover:opacity-100" strokeWidth={1.5} />
              </div>
              <p className="text-[13px] text-muted-foreground truncate">
                {action.description}
              </p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
