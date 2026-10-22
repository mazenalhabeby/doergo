"use client"

import { useTranslation } from "react-i18next"
import {
  AVAILABLE_MODULES,
  formatCents,
  moduleI18n,
  OBSERVER_SEAT_MONTHLY_CENTS,
  SEAT_MONTHLY_CENTS,
  type OrgCostBreakdown,
} from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { BillTotal } from "./bill-total"

/**
 * Where the money goes.
 *
 * The old page showed three plan columns and a price per seat — which answered
 * "what could I buy?" and never "why is my bill this?". With modules bought per
 * space and capabilities bought once, the second question is the only one a
 * customer actually opens this page with, and it has a real answer now: every
 * line is something somebody switched on, in a place they can go and switch off.
 *
 * Nothing is computed here beyond arranging what the server already sent. Every
 * figure comes from the same breakdown the Stripe sync is built from, so the
 * screen cannot disagree with the invoice — which is exactly what the tier model
 * allowed.
 *
 * Options are NOT here. They are bought once for the organization while
 * everything on this side is bought per space or per person, and the two used to
 * scroll past each other looking like the same kind of thing. They live in their
 * own rail beside this.
 */
export function BillBreakdown({ bill, estimate }: { bill: OrgCostBreakdown; estimate?: boolean }) {
  const { t } = useTranslation()

  const moduleLabel = (key: string) => {
    const english = AVAILABLE_MODULES.find((m) => m.key === key)?.label ?? key
    return t(moduleI18n.label(key), { defaultValue: english })
  }

  const peopleCents = bill.seatMonthlyCents + bill.observerSeatMonthlyCents
  const spacesCents = bill.spacesMonthlyCents + bill.usageMonthlyCents
  const headcount = bill.seatCount + bill.observerSeatCount

  return (
    <div className="space-y-4">
      {/* ── the total ─────────────────────────────────────────────────────── */}
      <BillTotal bill={bill} estimate={estimate} />

      {/* ── what is switched on, workspace by workspace ───────────────────── */}
      {bill.spaces.length > 0 && (
        <section>
          <SectionHead
            title={t("billing.bill.whatsActive", "What's active")}
            scope={t("billing.scope.perWorkspace", "Per workspace")}
            aside={t("billing.bill.spacesSummary", "{{count}} workspaces · {{price}}", {
              count: bill.spaces.length,
              price: formatCents(spacesCents),
            })}
          />
          <ul className="space-y-2.5">
            {bill.spaces.map((s) => {
              const usage = s.cost.usage.filter((u) => u.monthlyCents > 0)
              const empty = s.cost.lines.length === 0 && usage.length === 0
              return (
                <li
                  key={s.spaceId}
                  className={cn(
                    "rounded-xl border border-border bg-card",
                    // A free workspace is worth seeing, and worth seeing as
                    // quieter than the ones costing money.
                    empty && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className={
                          "grid h-6 w-6 shrink-0 place-items-center rounded-md bg-violet-500/10 " +
                          "text-[11px] font-bold text-violet-500"
                        }
                      >
                        {s.spaceName.trim().charAt(0).toUpperCase() || "·"}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">{s.spaceName}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatCents(s.cost.monthlyCents)}
                    </span>
                  </div>

                  {empty ? (
                    <p className="px-4 pb-3 text-xs text-muted-foreground">
                      {t("billing.bill.noModules", "Nothing switched on — this workspace is free")}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                      {s.cost.lines.map((l) => (
                        <span
                          key={l.moduleKey}
                          className={
                            "inline-flex items-center gap-1.5 rounded-lg border border-border/60 " +
                            "bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                          }
                        >
                          {moduleLabel(l.moduleKey)}
                          <b className="font-semibold tabular-nums text-foreground">{formatCents(l.monthlyCents)}</b>
                        </span>
                      ))}
                      {usage.map((u) => (
                        <span
                          key={`u-${u.moduleKey}`}
                          className={
                            "inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 " +
                            "bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400"
                          }
                        >
                          {t("billing.bill.usageLine", "{{module}} usage {{price}}", {
                            module: moduleLabel(u.moduleKey),
                            price: formatCents(u.monthlyCents),
                          })}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ── people, itemised ──────────────────────────────────────────────── */}
      <section>
        <SectionHead
          title={t("billing.bill.seats", "People")}
          scope={t("billing.scope.perPerson", "Per person")}
          aside={t("billing.bill.peopleSummary", "{{count}} accounts · {{price}}", {
            count: headcount,
            price: formatCents(peopleCents),
          })}
        />
        <div className="rounded-xl border border-border bg-card">
          <PersonRow
            label={t("billing.bill.staffSeats", "Staff")}
            count={bill.staffSeatCount}
            each={SEAT_MONTHLY_CENTS}
            cents={bill.staffSeatCount * SEAT_MONTHLY_CENTS}
          />
          {bill.externalSeatCount > 0 && (
            <PersonRow
              label={t("billing.bill.externalSeats", "External supervisors")}
              tag={t("billing.bill.externalTag", "client staff")}
              tagCls="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              count={bill.externalSeatCount}
              each={SEAT_MONTHLY_CENTS}
              cents={bill.externalSeatCount * SEAT_MONTHLY_CENTS}
            />
          )}
          {bill.observerSeatCount > 0 && (
            <PersonRow
              label={t("billing.bill.observerSeats", "External observers")}
              tag={t("billing.bill.observerTag", "watches only")}
              tagCls="bg-teal-500/10 text-teal-600 dark:text-teal-400"
              count={bill.observerSeatCount}
              each={OBSERVER_SEAT_MONTHLY_CENTS}
              cents={bill.observerSeatMonthlyCents}
            />
          )}
        </div>
      </section>
    </div>
  )
}

// ── pieces ────────────────────────────────────────────────────────────────

/**
 * A heading that states what it is priced BY.
 *
 * Three things are billed three different ways — per person, per workspace,
 * once for the organization — and that is the single hardest thing to see on
 * this page. Explaining it in a sentence underneath worked only for people who
 * read the sentence. Saying it beside every heading means the model can be read
 * off the page without reading anything: three sections, three scopes.
 */
export function SectionHead({ title, scope, aside }: { title: string; scope: string; aside: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {scope}
        </span>
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{aside}</span>
    </div>
  )
}

export function PersonRow({
  label,
  tag,
  tagCls,
  count,
  each,
  cents,
}: {
  label: string
  tag?: string
  tagCls?: string
  count: number
  each: number
  cents: number
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <span className="truncate">{label}</span>
        {tag && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold", tagCls)}>{tag}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-4">
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("billing.bill.seatsDetail", "{{count}} × {{price}}", { count, price: formatCents(each) })}
        </span>
        <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums text-foreground">
          {formatCents(cents)}
        </span>
      </span>
    </div>
  )
}
