"use client"

import { useTranslation } from "react-i18next"
import { ASSET_STATUS_ORDER, type AssetStatusKey } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"

/*
  One look per state, and one place that decides it.

  The chip appears on the record header, on every row of a kind's list and in
  the form. Three copies of "amber means maintenance" is how a list ends up
  saying one thing and the record it opens another.
*/
const TONE: Record<AssetStatusKey, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  MAINTENANCE: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  INACTIVE: "bg-muted text-muted-foreground",
  // Retired reads as set aside, not as a warning: nothing is wrong with it.
  RETIRED: "border border-dashed border-border bg-transparent text-muted-foreground",
}

export const asStatus = (value: unknown): AssetStatusKey =>
  (ASSET_STATUS_ORDER as readonly string[]).includes(value as string) ? (value as AssetStatusKey) : "ACTIVE"

export function useAssetStatusLabel() {
  const { t } = useTranslation()
  const fallback: Record<AssetStatusKey, string> = {
    ACTIVE: "Active", MAINTENANCE: "In maintenance", INACTIVE: "Inactive", RETIRED: "Retired",
  }
  return (status: AssetStatusKey) => t(`assetFacts.status.${status}`, fallback[status])
}

export function AssetStatusChip({ status, className }: { status: unknown; className?: string }) {
  const label = useAssetStatusLabel()
  const s = asStatus(status)
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        TONE[s],
        className,
      )}
    >
      {label(s)}
    </span>
  )
}

/**
 * Choose a state. Four buttons rather than a dropdown: there are only four, and
 * seeing "Retired" sitting beside "Active" is part of understanding what it is.
 */
export function AssetStatusPicker({
  value,
  onChange,
}: {
  value: AssetStatusKey
  onChange: (next: AssetStatusKey) => void
}) {
  const { t } = useTranslation()
  const label = useAssetStatusLabel()
  return (
    <div className="space-y-1.5">
      <div role="radiogroup" aria-label={t("assetFacts.status.label", "Status")} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {ASSET_STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "h-8 rounded-md border px-2 text-xs font-medium transition-colors",
              value === s
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label(s)}
          </button>
        ))}
      </div>
      {/* Said every time Retired is chosen, because it is the one choice here
          whose consequences reach past this record — the bill and every picker. */}
      {value === "RETIRED" && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t(
            "assetFacts.status.retiredHint",
            "Retired stops it counting on the bill and hides it from pickers. Its jobs, money and custody stay.",
          )}
        </p>
      )}
    </div>
  )
}
