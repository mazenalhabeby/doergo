"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { formatHoursMinutes } from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"
import { money } from "./invoice-document"
import { formatMoney, MONEY_LOCALE } from "@/lib/money"
import type { CostRow } from "../_lib/labour-cost-rows"

/**
 * What this invoice makes — what you bill, what the labour costs you, what you
 * keep — and person by person, where the cost comes from.
 *
 * ⚠️ NEVER on the client's copy, and only rendered for `canViewLabourCost`; the
 * server strips cost from the response on the same permission, so this is the
 * screen agreeing with the boundary, not the boundary.
 *
 * ⚠️ Costs are in the ORGANIZATION'S currency, the bill in the invoice's. "You
 * keep" subtracts one from the other only through the invoice's saved exchange
 * rate (`billedInBase`); with no rate it is a dash, never a guess.
 */
export function LabourCostPanel({
  rows,
  billed,
  billedInBase,
  currency,
  baseCurrency,
  needsRate,
}: {
  rows: CostRow[]
  billed: number
  billedInBase: number | null
  currency: string
  baseCurrency: string
  /** Show "the margin needs an exchange rate" instead of a margin. */
  needsRate: boolean
}) {
  const { t } = useTranslation()
  const cost = rows.reduce((s, r) => s + (r.costCents ?? 0), 0) / 100
  const hours = rows.reduce((s, r) => s + r.hours, 0)
  const days = rows.reduce((s, r) => s + r.days, 0)
  const missing = rows.filter((r) => r.costCents == null)
  const keep = billedInBase == null ? null : billedInBase - cost
  const keepPct = keep != null && billedInBase ? Math.round((keep / billedInBase) * 100) : null
  const costShare = billedInBase ? Math.min(100, Math.max(0, (cost / billedInBase) * 100)) : 0
  const daysText = (n: number) => t("invoices.create.costDays", { count: n })

  return (
    <div className="rounded-[22px] border border-border bg-card shadow-shell p-4 sm:p-5">
      <p className="mb-3 text-sm font-medium text-foreground">{t("invoices.create.marginTitle")}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">{t("invoices.create.youBill")}</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">{money(billed, currency)}</p>
          {billedInBase != null && currency !== baseCurrency && (
            <p className="text-[11px] tabular-nums text-muted-foreground">≈ {money(billedInBase, baseCurrency)}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("invoices.create.labourCostsYou")}</p>
          <p className="text-xl font-semibold tabular-nums text-shell-warn">{money(cost, baseCurrency)}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {formatHoursMinutes(hours)}
            {days > 0 ? ` · ${daysText(days)}` : ""}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("invoices.create.youKeep")}</p>
          {keep == null ? (
            <p className="text-xl font-semibold tabular-nums text-muted-foreground">—</p>
          ) : (
            <>
              <p
                className={cn("text-xl font-semibold tabular-nums", keep < 0 ? "text-shell-crit" : "text-shell-accent")}
              >
                {money(keep, baseCurrency)}
              </p>
              {keepPct != null && (
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {t("invoices.create.keepShare", { pct: keepPct })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {billedInBase != null && billedInBase > 0 && (
        <div className="mt-4" aria-hidden="true">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-shell-warn" style={{ width: `${costShare}%` }} />
            <div className="bg-shell-accent" style={{ width: `${100 - costShare}%` }} />
          </div>
        </div>
      )}

      {needsRate && (
        <p className="mt-3 rounded-xl bg-shell-accent-soft px-3 py-2 text-xs text-foreground">
          {t("currency.marginNeedsRate", { from: currency, to: baseCurrency })}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-2 font-medium">{t("invoices.create.costPerson")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("invoices.create.costHours")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("invoices.create.costDaysCol")}</th>
                <th className="px-2 py-2 font-medium">{t("invoices.create.costPayThem")}</th>
                <th className="py-2 pl-2 text-right font-medium">{t("invoices.create.costCol")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/70 align-middle">
                  <td className="py-2.5 pr-2">
                    <span className="block font-medium text-foreground">{r.name}</span>
                    {r.role && <span className="block text-[11px] text-muted-foreground">{r.role}</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {r.hours > 0 ? formatHoursMinutes(r.hours) : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.days > 0 ? daysText(r.days) : "—"}</td>
                  <td className="px-2 py-2.5 text-xs">
                    {r.costCents == null ? (
                      <span className="text-shell-warn">
                        {t("invoices.create.costNoRate")}
                        {r.workerId && (
                          <Link
                            href={`/members/${r.workerId}?edit=1`}
                            className="ml-2 font-semibold text-shell-accent hover:underline"
                          >
                            {t("invoices.create.costSetRate")}
                          </Link>
                        )}
                      </span>
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        {r.hourRateCents != null && (
                          <span>
                            <span
                              className={
                                "mr-1.5 rounded bg-shell-accent-soft px-1.5 py-px text-[10px] font-bold " +
                                "text-shell-accent"
                              }
                            >
                              {t("invoices.create.tagHour")}
                            </span>
                            {formatMoney(r.hourRateCents, baseCurrency, MONEY_LOCALE)} {t("invoices.create.perHour")}
                          </span>
                        )}
                        {r.dayRateCents != null && (
                          <span>
                            <span
                              className={
                                "mr-1.5 rounded bg-shell-chip px-1.5 py-px text-[10px] font-bold " + "text-foreground"
                              }
                            >
                              {t("invoices.create.tagDay")}
                            </span>
                            {formatMoney(r.dayRateCents, baseCurrency, MONEY_LOCALE)} {t("invoices.create.perDay")}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pl-2 text-right tabular-nums">
                    {r.costCents == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatMoney(r.costCents, baseCurrency, MONEY_LOCALE)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-3 pr-2">{t("invoices.create.costTotal")}</td>
                <td className="px-2 pt-3 text-right tabular-nums">{formatHoursMinutes(hours)}</td>
                <td className="px-2 pt-3 text-right tabular-nums">{days > 0 ? daysText(days) : "—"}</td>
                <td />
                <td className="pl-2 pt-3 text-right tabular-nums text-shell-warn">{money(cost, baseCurrency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {missing.length > 0 && (
        <p className="mt-3 rounded-xl bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] px-3 py-2 text-xs text-shell-warn">
          {t("invoices.create.costMissing", { names: missing.map((r) => r.name).join(", "), count: missing.length })}
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">{t("invoices.create.marginHint")}</p>
    </div>
  )
}
