"use client"

import { MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"

/** One switchable part of the record. */
export function KindOptionRow({
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
