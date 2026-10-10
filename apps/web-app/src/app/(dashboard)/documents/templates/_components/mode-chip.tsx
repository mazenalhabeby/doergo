"use client"

import { useTranslation } from "react-i18next"
import { PenLine, CheckCheck, Printer, Ban } from "lucide-react"
import { cn } from "@/lib/utils"

export function ModeChip({ mode }: { mode: string }) {
  const { t } = useTranslation()
  const map: Record<string, { cls: string; Icon: typeof PenLine }> = {
    IN_APP: { cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400", Icon: PenLine },
    ACKNOWLEDGE: { cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", Icon: CheckCheck },
    // Amber, not red: not a fault, a legal fact about the document.
    WET_INK: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", Icon: Printer },
    NONE: { cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", Icon: Ban },
  }
  const v = map[mode] ?? map.NONE!
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", v.cls)}>
      <v.Icon className="h-3 w-3" />
      {t(`documents.templates.modes.${mode.toLowerCase()}`)}
    </span>
  )
}
