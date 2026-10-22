"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { type SpaceMember, type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useAuth } from "@/contexts/auth-context"
import { rateHistoryApi, spaceMembersApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { DatedRateField } from "@/components/rates/dated-rate"
import { useCents, useSpaceCurrency, type BillBy } from "./work-roles"

/**
 * What a client pays for this member here — their own dated hourly rate (or the inherited one), the
 * work role's day rate — and, for whoever may see labour cost, what they cost from their profile.
 */
export function MemberRatesSection({
  spaceId,
  member,
  bill,
  workRole,
  onSaved,
  section,
  heading,
}: {
  spaceId: string
  member: SpaceMember
  bill: BillBy
  /** Their trade as this workspace prices it. */
  workRole: SpaceRoleInSpace | undefined
  /** Refreshes the roster and the roles after a rate changes. */
  onSaved: () => void
  section: string
  heading: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const money = useSpaceCurrency(spaceId)
  const cents = useCents(money.bill)
  const { user } = useAuth()
  const canViewLabourCost = (user as { canViewLabourCost?: boolean } | null)?.canViewLabourCost === true
  const { data: rates } = useQuery({
    queryKey: keys.rates.history("ASSIGNMENT", member.id),
    queryFn: () => rateHistoryApi.list({ target: "ASSIGNMENT", targetId: member.id, spaceId }),
  })
  const saveRate = async (patch: { billRateCents?: number | null }, from?: string) => {
    await spaceMembersApi.updateRate(spaceId, member.id, { ...patch, ...(from ? { effectiveFrom: from } : {}) })
    onSaved()
    queryClient.invalidateQueries({ queryKey: keys.rates.history("ASSIGNMENT", member.id) })
  }

  return (
    <section className={section}>
      <h3 className={heading}>{t("scheduling.membersPage.rates")}</h3>
      {bill !== "DAY" && (
        <DatedRateField
          id={`panel-bill-${member.id}`}
          label={t("rates.spaceBill")}
          currency={money.bill}
          currentCents={member.billRateCents ?? null}
          emptyLabel={
            member.inheritedBillRateCents != null
              ? t("rates.usesDefault", { rate: cents(member.inheritedBillRateCents) })
              : undefined
          }
          history={rates?.filter((r) => r.kind === "BILL_HOUR")}
          onSubmit={(c, from) => saveRate({ billRateCents: c }, from)}
        />
      )}
      {bill !== "HOUR" && (
        <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("scheduling.workRoles.dayRate")}</span>
          <span className="font-semibold tabular-nums">
            {workRole?.dayRateCents != null ? (
              `${cents(workRole.dayRateCents)} ${t("rates.perDay")}`
            ) : (
              <span className="font-normal text-muted-foreground">
                {workRole ? t("scheduling.workRoles.dayRateNone") : t("scheduling.membersPage.needsWorkRole")}
              </span>
            )}
            {workRole && (
              <span className="block text-right text-[11px] font-normal text-muted-foreground">
                {t("scheduling.membersPage.fromRole", { role: workRole.name })}
              </span>
            )}
          </span>
        </div>
      )}
      {/*
        ⚠️ WHAT THIS PERSON COSTS LIVES ON THEIR PROFILE, read-only
        here. A second, per-workspace cost read the same on screen
        and silently won; a client's day rate copied into it made
        the margin zero (rate-ladder LEVELS_BY_KIND).
      */}
      {canViewLabourCost && (
        <CostFromProfile
          member={member}
          bill={bill}
          hourPrice={member.billRateCents ?? member.inheritedBillRateCents ?? null}
          dayPrice={workRole?.dayRateCents ?? null}
          priceCurrency={money.bill}
          costCurrency={money.cost}
        />
      )}
    </section>
  )
}

/**
 * "Costs you", read from the person's profile, with the margin beside it when
 * both figures are known and in the same currency. Nothing to type here: the
 * link goes to the one place a cost is set.
 */
function CostFromProfile({
  member,
  bill,
  hourPrice,
  dayPrice,
  priceCurrency,
  costCurrency,
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
    ...(bill !== "DAY"
      ? [{ key: "hour", label: t("rates.perHourLabel"), cost: member.profileCostRateCents ?? null, price: hourPrice }]
      : []),
    ...(bill !== "HOUR"
      ? [{ key: "day", label: t("rates.perDayLabel"), cost: member.profileCostDayCents ?? null, price: dayPrice }]
      : []),
  ]
  const sameCurrency = priceCurrency === costCurrency
  return (
    <div className="space-y-2 rounded-xl border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">{t("rates.costsYou")}</span>
        <Link
          href={`/members/${member.userId}`}
          className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
        >
          {t("rates.changeOnProfile")}
        </Link>
      </div>
      {rows.map((r) => {
        const margin = sameCurrency && r.cost != null && r.price != null ? r.price - r.cost : null
        return (
          <div key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="text-right">
              {r.cost != null ? (
                <span className="font-semibold tabular-nums">{costMoney(r.cost)}</span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">{t("rates.costNotSet")}</span>
              )}
              {margin != null && (
                <span
                  className={cn(
                    "block text-[11px] tabular-nums",
                    margin <= 0 ? "text-red-600 dark:text-red-400" : "text-teal-700 dark:text-teal-400",
                  )}
                >
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
