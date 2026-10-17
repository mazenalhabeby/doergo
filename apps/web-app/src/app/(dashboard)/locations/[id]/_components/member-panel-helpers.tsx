"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { type SpaceMember } from "@hbcfield/shared/client"
import { useCents, type BillBy } from "./work-roles"

/** MemberPanel's module-level helpers, moved here unchanged so its sections can read them too. */
/** One person in the workspace: their roles, rates, routing and removal (moved here unchanged). */
/**
 * "Costs you", read from the person's profile, with the margin beside it when
 * both figures are known and in the same currency. Nothing to type here: the
 * link goes to the one place a cost is set.
 */
export function CostFromProfile({
  member, bill, hourPrice, dayPrice, priceCurrency, costCurrency,
}: {
  member: SpaceMember
  bill: BillBy
  hourPrice: number | null
  dayPrice: number | null
  priceCurrency: string
  costCurrency: string
}) {
  const { t } = useTranslation()
  const costMoney = useCents(costCurrency)
  const rows = [
    ...(bill !== "DAY" ? [{ key: "hour", label: t("rates.perHourLabel"), cost: member.profileCostRateCents ?? null, price: hourPrice }] : []),
    ...(bill !== "HOUR" ? [{ key: "day", label: t("rates.perDayLabel"), cost: member.profileCostDayCents ?? null, price: dayPrice }] : []),
  ]
  const sameCurrency = priceCurrency === costCurrency
  return (
    <div className="space-y-2 rounded-xl border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">{t("rates.costsYou")}</span>
        <Link href={`/members/${member.userId}`} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
          {t("rates.changeOnProfile")}
        </Link>
      </div>
      {rows.map((r) => {
        const margin = sameCurrency && r.cost != null && r.price != null ? r.price - r.cost : null
        return (
          <div key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="text-right">
              {r.cost != null
                ? <span className="font-semibold tabular-nums">{costMoney(r.cost)}</span>
                : <span className="text-amber-700 dark:text-amber-400">{t("rates.costNotSet")}</span>}
              {margin != null && (
                <span className={cn("block text-[11px] tabular-nums", margin <= 0 ? "text-red-600 dark:text-red-400" : "text-teal-700 dark:text-teal-400")}>
                  {margin <= 0 ? t("rates.costsMoreThanPrice") : t("rates.marginEach", { amount: costMoney(margin) })}
                </span>
              )}
            </span>
          </div>
        )
      })}
      <p className="text-[11px] text-muted-foreground">{t("rates.costsYouHint")}</p>
    </div>
  )
}
