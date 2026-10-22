"use client"

import { useTranslation } from "react-i18next"
import { formatCents, SEAT_MONTHLY_CENTS, spaceMonthlyCost } from "@hbcfield/shared/client"

/**
 * What this space costs, from what is switched on at this moment.
 *
 * Read from `enabledModules` — the unsaved state — not from the space record,
 * because the question somebody is asking while toggling is "what will this
 * cost me", and answering it only after they press Save is answering it too
 * late. The saved figure is shown next to it when the two differ.
 */
export function SpaceCostSummary({
  enabledModules,
  saved,
  usageModules,
  liveUsageCents,
}: {
  enabledModules: string[]
  saved: string[]
  usageModules: string[]
  liveUsageCents: number
}) {
  const { t } = useTranslation()
  const liveCost = spaceMonthlyCost(enabledModules)
  const savedCost = spaceMonthlyCost(saved)
  const costChanged = liveCost.monthlyCents !== savedCost.monthlyCents
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">{t("billing.spaceCostLabel", "This workspace costs")}</p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {formatCents(liveCost.monthlyCents + liveUsageCents)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{t("billing.perMonth", "/month")}</span>
        </p>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {costChanged ? (
          // Named as not-yet-charged, because a number that changes on screen
          // reads as a number already applied.
          <p className="text-amber-600 dark:text-amber-500">
            {t("billing.spaceCostPending", "Was {{was}} — saved when you save modules", {
              was: formatCents(savedCost.monthlyCents + (saved.includes("assets") ? liveUsageCents : 0)),
            })}
          </p>
        ) : (
          <p>
            {usageModules.length > 0
              ? t("billing.usage.includesCounted", "Includes what this space's assets add")
              : t("billing.spaceCostPerModule", "Each module adds its own price")}
          </p>
        )}
        <p className="mt-0.5">
          {t("billing.seatLine", "Users are billed separately at {{price}} each", {
            price: formatCents(SEAT_MONTHLY_CENTS),
          })}
        </p>
      </div>
    </div>
  )
}
