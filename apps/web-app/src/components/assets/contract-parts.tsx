"use client"

import { PackagePlus, UserMinus, UserPlus } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/*
  Shared by the contract reader (an office reads a contract) and the proposal
  queue (an office decides a page a member sent in): both show the fields as
  borderless boxes and the plan as a list of steps.
*/

/** The bare input inside a field box. */
export function ContractFieldInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className="mt-1 h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
    />
  )
}

/** The icon of one step of the plan: create, hand over, retire, or take back. */
export function StepIcon({ kind }: { kind: string }) {
  const cls = "mt-0.5 h-3.5 w-3.5 shrink-0"
  if (kind === "create") return <PackagePlus className={cn(cls, "text-primary")} />
  if (kind === "hand-over") return <UserPlus className={cn(cls, "text-emerald-600 dark:text-emerald-400")} />
  if (kind === "retire") return <PackagePlus className={cn(cls, "rotate-180 text-muted-foreground")} />
  return <UserMinus className={cn(cls, "text-amber-600 dark:text-amber-400")} />
}
