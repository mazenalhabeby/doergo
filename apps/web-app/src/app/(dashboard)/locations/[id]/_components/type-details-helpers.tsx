"use client"

import { ArrowDownLeft } from "lucide-react"
import { type LogFieldType } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"

/** TypeDetails's module-level helpers, moved here unchanged so its sections can read them too. */
export function fieldTypeLabel(t: (k: string, d: string) => string, ft: LogFieldType): string {
  switch (ft) {
    case "text": return t("assetLog.fieldType.text", "Text")
    case "number": return t("assetLog.fieldType.number", "Number")
    case "date": return t("assetLog.fieldType.date", "Date")
    case "choice": return t("assetLog.fieldType.choice", "Choice")
    case "photo": return t("assetLog.fieldType.photo", "Photo")
    case "money": return t("assetLog.fieldType.money", "Amount")
  }
}

export function FlagRow(
  { title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function DirBtn(
  { active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ArrowDownLeft; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  )
}
