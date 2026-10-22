"use client"

import { PackagePlus, UserMinus, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The icon of one step of a contract's plan: create, hand over, retire, or take back. Shared by the
 * contract reader and the proposal queue, which both show the plan as a list of steps.
 */
export function StepIcon({ kind }: { kind: string }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0"
  if (kind === "create") return <PackagePlus className={cn(cls, "text-primary")} />
  if (kind === "hand-over") return <UserPlus className={cn(cls, "text-emerald-600 dark:text-emerald-400")} />
  if (kind === "retire") return <PackagePlus className={cn(cls, "rotate-180 text-muted-foreground")} />
  return <UserMinus className={cn(cls, "text-amber-600 dark:text-amber-400")} />
}
