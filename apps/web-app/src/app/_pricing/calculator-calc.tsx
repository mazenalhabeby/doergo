"use client"

import { ChevronDown } from "lucide-react"
import { SEAT_MONTHLY_CENTS, formatCents } from "@hbcfield/shared/client"
import { DISPLAY, MONO, Line } from "./calculator-helpers"
import type { CalculatorState } from "./use-calculator"

/** Part of Calculator's markup, moved here unchanged; it reads the page's state from `vm`. */
export function CalculatorCalc({ vm }: { vm: CalculatorState }) {
  const { bill, t, perPerson, setOpenBill, openBill, people } = vm
  return (
    <div className="lg:sticky lg:top-24">
      <div className="rounded-2xl border border-foreground/[0.12] bg-background p-6 sm:p-7">
        <p
          className={
            `${DISPLAY} text-[clamp(2.4rem,7vw,3.4rem)] font-normal leading-none ` +
            `tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]`
          }
        >
          {formatCents(bill.monthlyCents)}
        </p>
        <p className={`${MONO} mt-2 text-[11.5px] text-foreground/45`}>{t("pricing.calc.aMonth", "a month")}</p>

        <div className="mt-5 flex items-baseline gap-2 border-t border-foreground/[0.08] pt-5">
          <span className={`${DISPLAY} text-[1.6rem] leading-none text-foreground [font-variant-numeric:tabular-nums]`}>
            {formatCents(perPerson)}
          </span>
          <span className="text-[13px] text-foreground/50">{t("pricing.calc.perPerson", "per person, per month")}</span>
        </div>

        {/* the itemised bill */}
        <button
          type="button"
          onClick={() => setOpenBill((o) => !o)}
          aria-expanded={openBill}
          className={
            `${MONO} mt-6 inline-flex items-center gap-2 text-[10.5px] uppercase ` +
            `tracking-[0.16em] text-foreground/45 transition-colors ` +
            `hover:text-foreground`
          }
        >
          {t("pricing.calc.breakdown", "Where it comes from")}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openBill ? "rotate-180" : ""}`} />
        </button>

        {openBill && (
          <div className={`${MONO} mt-4 space-y-4 text-[12px] [font-variant-numeric:tabular-nums]`}>
            <Line
              label={t("pricing.calc.seatsLine", "{{count}} people × {{price}}", {
                count: people,
                price: formatCents(SEAT_MONTHLY_CENTS),
              })}
              cents={bill.seatMonthlyCents}
              strong
            />

            {bill.spaces.map((s, i) => (
              <div key={s.spaceId} className="border-t border-foreground/[0.07] pt-4">
                <Line label={t("pricing.calc.siteN", "Site {{n}}", { n: i + 1 })} cents={s.cost.monthlyCents} strong />
                <div className="mt-2 space-y-1 pl-3">
                  {s.cost.lines.map((l) => (
                    <Line
                      key={l.moduleKey}
                      label={t(`modules.${l.moduleKey}.label`, l.moduleKey)}
                      cents={l.monthlyCents}
                      dim
                    />
                  ))}
                  {s.cost.usage.map((u) => (
                    <Line
                      key={`u-${u.moduleKey}`}
                      label={t("pricing.calc.overAllowance", "{{n}} over the {{included}} included", {
                        n: u.billableUnits,
                        included: u.included,
                      })}
                      cents={u.monthlyCents}
                      dim
                    />
                  ))}
                  {s.cost.lines.length === 0 && (
                    <p className="text-foreground/30">{t("pricing.calc.nothingOn", "nothing switched on")}</p>
                  )}
                </div>
              </div>
            ))}

            {bill.addOns.length > 0 && (
              <div className="border-t border-foreground/[0.07] pt-4">
                <Line label={t("pricing.calc.companyWide", "Company-wide")} cents={bill.addOnsMonthlyCents} strong />
                <div className="mt-2 space-y-1 pl-3">
                  {bill.addOns.map((a) => (
                    <Line key={a.key} label={t(`addOns.${a.key}.label`, a.key)} cents={a.monthlyCents} dim />
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-foreground/[0.12] pt-4">
              <Line label={t("pricing.calc.total", "Every month")} cents={bill.monthlyCents} strong />
            </div>
          </div>
        )}

        <p className="mt-6 border-t border-foreground/[0.08] pt-5 text-[12.5px] leading-relaxed text-foreground/45">
          {t(
            "pricing.calc.footnote",
            "Prices exclude VAT. 14 days free, no card. Change anything any time — " + "the bill follows the same day.",
          )}
        </p>
      </div>
    </div>
  )
}
