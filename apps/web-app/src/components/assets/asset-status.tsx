"use client"

import { useTranslation } from "react-i18next"
import { ASSET_STATUS_ORDER, type AssetStatusKey } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { ChoiceChip } from "@/components/ui/choice-chip"
import { toneChip } from "@/lib/status-tones"

/*
  One look per state, and one place that decides it.

  The chip appears on the record header, on every row of a kind's list and in
  the form. Three copies of "amber means maintenance" is how a list ends up
  saying one thing and the record it opens another.
*/
const TONE: Record<AssetStatusKey, string> = {
  ACTIVE: toneChip("success"),
  MAINTENANCE: toneChip("warning"),
  INACTIVE: toneChip("neutral"),
  // Retired reads as set aside, not as a warning: nothing is wrong with it.
  RETIRED: "border border-dashed border-border bg-transparent text-muted-foreground",
}

export const asStatus = (value: unknown): AssetStatusKey =>
  (ASSET_STATUS_ORDER as readonly string[]).includes(value as string) ? (value as AssetStatusKey) : "ACTIVE"

export function useAssetStatusLabel() {
  const { t } = useTranslation()
  const fallback: Record<AssetStatusKey, string> = {
    ACTIVE: "Active",
    MAINTENANCE: "In maintenance",
    INACTIVE: "Inactive",
    RETIRED: "Retired",
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
      <div
        role="radiogroup"
        aria-label={t("assetFacts.status.label", "Status")}
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
      >
        {ASSET_STATUS_ORDER.map((s) => (
          <ChoiceChip
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            on={value === s}
            onClick={() => onChange(s)}
            className="h-8 font-medium"
          >
            {label(s)}
          </ChoiceChip>
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
