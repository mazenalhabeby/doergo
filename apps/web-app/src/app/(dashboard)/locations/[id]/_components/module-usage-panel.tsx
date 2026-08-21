"use client"

import { useTranslation } from "react-i18next"
import { Boxes, TrendingDown } from "lucide-react"
import {
  AVAILABLE_MODULES,
  formatCents,
  moduleI18n,
  moduleMonthlyCents,
  usageCost,
  usagePriceFor,
  marginalUnitCents,
  nextUsageBreak,
} from "@hbcfield/shared/client"

import { cn } from "@/lib/utils"

/**
 * What a counted module actually costs.
 *
 * Assets is not a switch — it has a base price and then a ladder over how many
 * assets there are. A single total would hide the only thing somebody wants to
 * know before adding two hundred flats: what the NEXT one costs, and how far
 * away the next price drop is. So the whole ladder is shown, with the rung they
 * are standing on marked, rather than a number they have to take on trust.
 *
 * Every figure here comes from the shared pricing module. Nothing is computed
 * on this screen, so the screen cannot disagree with the invoice.
 */
export function ModuleUsagePanel({ moduleKey, units }: { moduleKey: string; units: number }) {
  const { t } = useTranslation()
  const price = usagePriceFor(moduleKey)
  if (!price) return null

  const cost = usageCost(moduleKey, units)
  const nextBreak = nextUsageBreak(moduleKey, units)
  const base = moduleMonthlyCents(moduleKey)
  // The catalogue's English label is the fallback, not the raw key — an
  // untranslated heading should read "Assets", never "assets".
  const englishLabel = AVAILABLE_MODULES.find((m) => m.key === moduleKey)?.label ?? moduleKey
  const moduleLabel = t(moduleI18n.label(moduleKey), { defaultValue: englishLabel })

  // The count in the unit's own words — "17 assets", not "17".
  const unitLabel = (n: number) => t(`billing.usage.count.${price.unit}`, { count: n, defaultValue: `${n}` })

  // Every rung, not only the ones being paid for: the bands below explain the
  // total, and the ones above are the reason to keep going.
  const rows = price.bands.map((band, i) => {
    const from = (i === 0 ? cost.included : price.bands[i - 1]!.upTo!) + 1
    const line = cost.lines.find((l) => l.unitCents === band.unitCents && l.fromUnit === from)
    const current = cost.marginalUnitCents === band.unitCents
    return {
      key: `${from}-${band.upTo ?? "∞"}`,
      range:
        band.upTo == null
          ? t("billing.usage.bandOpen", "{{from}} and up", { from })
          : t("billing.usage.bandRange", "{{from}}–{{to}}", { from, to: band.upTo }),
      unitCents: band.unitCents,
      line,
      current,
    }
  })

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
            {/*
              Both rules in the first line somebody reads.

              There are two, and they pull in opposite directions: the free
              allowance is per space, the RATE comes from the organization's
              total. A heading that names only the total reads as though the
              free ones were pooled too — which is the question this line kept
              being asked.
            */}
            {t("billing.usage.heading", "{{module}} in this space — first {{included}} free", {
              module: moduleLabel,
              included: price.included,
            })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{unitLabel(cost.units)}</span>
            <span className="mx-1.5 text-border">·</span>
            {t("billing.usage.otherSpacesSeparate", "Other spaces are counted and charged separately")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {formatCents(cost.monthlyCents)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{t("billing.perMonth", "/month")}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("billing.usage.onTop", "on top of the {{base}} base", { base: formatCents(base) })}
          </p>
        </div>
      </div>

      {/* The ladder. The allowance first, then every rung — the one being paid
          at is marked, because that is the rate the next decision is made at. */}
      <div className="overflow-hidden rounded-lg border border-border/60">
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-3 py-1.5 text-xs",
            cost.marginalUnitCents === 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-muted/30",
          )}
        >
          <span className="text-muted-foreground">
            {t("billing.usage.included", "First {{count}} included", { count: cost.included })}
          </span>
          <span className="font-medium text-emerald-700 dark:text-emerald-400">{t("billing.usage.free", "Free")}</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              "flex items-center justify-between gap-3 border-t border-border/40 px-3 py-1.5 text-xs",
              row.current && "bg-primary/5",
            )}
          >
            <span className={cn("tabular-nums", row.current ? "font-medium text-foreground" : "text-muted-foreground")}>
              {row.range}
            </span>
            <span className="flex items-baseline gap-2 tabular-nums">
              <span className={row.current ? "font-medium text-foreground" : "text-muted-foreground"}>
                {t("billing.usage.each", "{{price}} each", { price: formatCents(row.unitCents) })}
              </span>
              {row.line && (
                <span className="w-20 text-right font-medium text-foreground">
                  {formatCents(row.line.monthlyCents)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {cost.monthlyCents === 0 ? (
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            {t("billing.usage.allIncluded", "All included so far — nothing extra to pay")}
          </span>
        ) : (
          <span>{t("billing.usage.effective", "Works out at {{price}} each", { price: formatCents(cost.effectiveUnitCents) })}</span>
        )}
        {/*
          Inside the allowance, the next VOLUME break is the wrong fact to lead
          with: "32 more and every one after that is €0.80" sitting beside "all
          included" reads as nothing being charged until then, when in truth
          charging starts at the 21st. So while nothing is being paid, the panel
          says when that stops being true — and only afterwards does it point at
          the next discount.
        */}
        {cost.marginalUnitCents === 0 ? (
          <span className="flex items-center gap-1 font-medium text-foreground">
            {t("billing.usage.chargingStarts", "{{count}} more before anything is charged, then {{price}} each", {
              count: cost.included - cost.units,
              price: formatCents(marginalUnitCents(moduleKey, cost.included)),
            })}
          </span>
        ) : nextBreak ? (
          <span className="flex items-center gap-1 font-medium text-foreground">
            <TrendingDown className="h-3 w-3" />
            {t("billing.usage.nextBreak", "{{count}} more and every one after that is {{price}}", {
              count: nextBreak.unitsAway,
              price: formatCents(nextBreak.unitCents),
            })}
          </span>
        ) : (
          <span>{t("billing.usage.lastBand", "You are on the lowest rate there is")}</span>
        )}
      </div>

    </div>
  )
}
