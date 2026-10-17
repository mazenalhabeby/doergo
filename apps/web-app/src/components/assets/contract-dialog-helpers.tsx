"use client"

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { ContractFieldInput } from "./contract-parts"

/** ContractDialog's module-level helpers, moved here unchanged so its sections can read them too. */
/** One box, coloured by whether the reader could prove what it put in it. */
export function ReadField({
  label, value, confidence, onChange,
}: {
  label: string
  value: string
  confidence?: "certain" | "likely"
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className={cn(
      "rounded-xl border p-2.5",
      !confidence ? "border-border"
        : confidence === "certain" ? "border-emerald-500/45" : "border-amber-500/50",
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {confidence && (
          <span className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide",
            confidence === "certain"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          )}>
            {confidence === "certain" ? t("scan.found", "FOUND") : t("scan.check", "CHECK")}
          </span>
        )}
      </div>
      <ContractFieldInput value={value} onChange={onChange} />
    </div>
  )
}
