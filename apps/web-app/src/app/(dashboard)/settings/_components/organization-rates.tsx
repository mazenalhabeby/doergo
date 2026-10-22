"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { DatedRateField } from "@/components/rates/dated-rate"
import { CurrencySetting } from "@/components/rates/currency-setting"
import { useAuth } from "@/contexts/auth-context"
import { keys } from "@/lib/query-keys"
import { organizationsApi, rateHistoryApi, type OrganizationProfile } from "@/lib/api"

/** The organization's currency and its own bill / cost rates — each saved on its own, from a day. */
export function OrganizationRates({ profile }: { profile: OrganizationProfile | undefined }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { refreshUser } = useAuth()

  // The organization's own rates and their history — saved on their own, from a day.
  const { data: orgRates } = useQuery({
    queryKey: keys.rates.history("ORGANIZATION", profile?.id),
    queryFn: () => rateHistoryApi.list({ target: "ORGANIZATION", targetId: profile!.id! }),
    enabled: !!profile?.id,
  })
  const saveOrgRate = async (patch: Record<string, unknown>) => {
    await organizationsApi.updateProfile(patch)
    queryClient.invalidateQueries({ queryKey: keys.organization.profile() })
    queryClient.invalidateQueries({ queryKey: keys.rates.history("ORGANIZATION") })
  }

  return (
    <>
      {/*
      ⚠️ Rates are NOT part of this form's Save. Each one changes from a
      day and keeps its history, so it has its own Change button that asks
      from when — a Save button that rewrote it "from today" every time the
      address was edited would re-price nothing, but would bury the date
      the rate really changed.
    */}
      {/*
      The organization's currency: what workers' own rates, statements and
      margins are in, and what a workspace or client without one bills in.
      Its own Change button for the same reason as the rates below — a
      switch re-reads every rate set at this level.
    */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CurrencySetting
          id="org-currency"
          label={t("currency.orgLabel")}
          hint={t("currency.orgHint")}
          value={profile?.currency ?? "EUR"}
          ratesSet={orgRates?.filter((r) => r.cents != null).length ?? 0}
          onSave={async (code) => {
            await saveOrgRate({ currency: code })
            await refreshUser()
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DatedRateField
          id="org-bill-rate"
          label={t("rates.orgBill")}
          hint={t("rates.orgBillHint")}
          currentCents={profile?.billableRateCents ?? null}
          currency={profile?.currency ?? undefined}
          history={orgRates?.filter((r) => r.kind === "BILL_HOUR")}
          onSubmit={(c, from) => saveOrgRate({ billableRateCents: c, ...(from ? { rateEffectiveFrom: from } : {}) })}
        />
        <DatedRateField
          id="org-cost-rate"
          label={t("rates.orgCost")}
          hint={t("rates.orgCostHint")}
          currentCents={profile?.costRateCents ?? null}
          currency={profile?.currency ?? undefined}
          history={orgRates?.filter((r) => r.kind === "COST_HOUR")}
          onSubmit={(c, from) => saveOrgRate({ costRateCents: c, ...(from ? { rateEffectiveFrom: from } : {}) })}
        />
      </div>
    </>
  )
}
