"use client"

import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { BadgeCheck, Boxes, Users, Eye, UserCog } from "lucide-react"
import {
  formatCents,
  SEAT_MONTHLY_CENTS,
  OBSERVER_SEAT_MONTHLY_CENTS,
  type OrgCostBreakdown,
} from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"
import { cn } from "@/lib/utils"

/** The bill's headline card: the total, an agreed price, VAT, the proportions bar and the tiles. */
export function BillTotal({ bill, estimate }: { bill: OrgCostBreakdown; estimate?: boolean }) {
  const { t } = useTranslation()
  const peopleCents = bill.seatMonthlyCents + bill.observerSeatMonthlyCents
  const spacesCents = bill.spacesMonthlyCents + bill.usageMonthlyCents

  /*
    Percentages for the bar, computed once.

    Guarded against a zero total: a brand-new organization with nothing switched
    on and nobody in it would otherwise divide by zero and render NaN% widths —
    an unstyled sliver rather than an empty bar.
  */
  /*
    What the parts add up to — which is NOT always what is charged.

    An organization on an agreed price pays €120 against €863 of product. The
    segments below are the real prices of the real things, so they must be
    divided by their own total; using the charged number would give three bands
    summing to 719% and a bar that ran off its own container.
  */
  const listTotal = bill.listMonthlyCents ?? bill.monthlyCents

  const share = useMemo(() => {
    const total = listTotal
    if (total <= 0) return { people: 0, spaces: 0, options: 0 }
    return {
      people: ((bill.seatMonthlyCents + bill.observerSeatMonthlyCents) / total) * 100,
      spaces: ((bill.spacesMonthlyCents + bill.usageMonthlyCents) / total) * 100,
      options: (bill.addOnsMonthlyCents / total) * 100,
    }
  }, [bill, listTotal])

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
      {/* One soft wash behind the content, inert to pointers. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,hsl(var(--primary)/0.10),transparent_60%)]"
      />
      <div className="relative">
        <p className="text-sm text-muted-foreground">
          {estimate ? t("billing.bill.estimate", "At list price") : t("billing.bill.total", "Your monthly total")}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatCents(bill.monthlyCents)}
          <span className="ml-1 text-base font-normal text-muted-foreground">
            {t("billing.bill.perMonth", "/month")}
          </span>
          {/*
            The list price beside the agreed one, struck.

            Shown, not hidden. A customer who can see they are on €120 against
            a list price of €863 knows what their renewal conversation is
            about — and finding that out for the first time at renewal is the
            version of this that costs an account.
          */}
          {bill.agreement && listTotal !== bill.monthlyCents && (
            <span className="ml-2 align-middle text-base font-normal text-muted-foreground line-through">
              {formatCents(listTotal)}
            </span>
          )}
        </p>

        {bill.agreement && (
          <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <BadgeCheck className="h-3.5 w-3.5" />
              {t("billing.agreed.title", "You are on an agreed price")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("billing.agreed.body", "Your usage would otherwise come to {{list}} a month.", {
                list: formatCents(listTotal),
              })}
              {bill.agreement.until && (
                <>
                  {" "}
                  {t("billing.agreed.until", "This rate holds until {{date}}.", {
                    date: new Date(bill.agreement.until).toLocaleDateString(dateLocale()),
                  })}
                </>
              )}
            </p>
          </div>
        )}
        {/*
          Said here rather than at checkout.

          Every price in this model is stored in Stripe with
          `tax_behavior: exclusive` — VAT is added ON TOP, not carved out of
          these figures. A customer who reads €847.89 and is charged €1,017.47
          has been surprised by us, and that surprise happens at the worst
          possible moment. The rate is deliberately not named: it depends on
          where the customer is and whether they gave a VAT number, and Stripe
          decides it at checkout.
        */}
        <p className="mt-1 text-xs text-muted-foreground">
          {t("billing.bill.exVat", "Excludes VAT — tax is added at checkout, at the rate for your country.")}
        </p>

        {/*
          The proportions, before the parts.

          Seats are the smallest share of a typical bill and were the first
          thing this page showed. The bar says what actually dominates in one
          glance; the legend names every band, because a coloured segment
          nobody can name is decoration.
        */}
        {listTotal > 0 && (
          <>
            <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-muted" role="presentation">
              <span className="block bg-violet-500" style={{ width: `${share.spaces}%` }} />
              <span className="block bg-pink-500" style={{ width: `${share.options}%` }} />
              <span className="block bg-primary" style={{ width: `${share.people}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <Legend colour="bg-violet-500" label={t("billing.bill.spaces", "Workspaces")} cents={spacesCents} />
              <Legend
                colour="bg-pink-500"
                label={t("billing.bill.addOns", "Options")}
                cents={bill.addOnsMonthlyCents}
              />
              <Legend colour="bg-primary" label={t("billing.bill.seats", "People")} cents={peopleCents} />
            </div>
          </>
        )}

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            icon={<Users className="h-4 w-4" />}
            label={t("billing.bill.seats", "People")}
            cents={bill.staffSeatCount * SEAT_MONTHLY_CENTS}
            detail={t("billing.bill.seatsDetail", "{{count}} × {{price}}", {
              count: bill.staffSeatCount,
              price: formatCents(SEAT_MONTHLY_CENTS),
            })}
          />
          {/*
            An external supervisor costs the same as staff and is not staff.
            Shown only when there is one — an organization with no outsiders
            sees exactly the page it saw before.
          */}
          {bill.externalSeatCount > 0 && (
            <Tile
              icon={<UserCog className="h-4 w-4" />}
              label={t("billing.bill.externalSeats", "External supervisors")}
              cents={bill.externalSeatCount * SEAT_MONTHLY_CENTS}
              detail={t("billing.bill.seatsDetail", "{{count}} × {{price}}", {
                count: bill.externalSeatCount,
                price: formatCents(SEAT_MONTHLY_CENTS),
              })}
            />
          )}
          {bill.observerSeatCount > 0 && (
            <Tile
              icon={<Eye className="h-4 w-4" />}
              label={t("billing.bill.observerSeats", "External observers")}
              cents={bill.observerSeatMonthlyCents}
              detail={t("billing.bill.seatsDetail", "{{count}} × {{price}}", {
                count: bill.observerSeatCount,
                price: formatCents(OBSERVER_SEAT_MONTHLY_CENTS),
              })}
            />
          )}
          <Tile
            icon={<Boxes className="h-4 w-4" />}
            label={t("billing.bill.spaces", "Workspaces")}
            cents={spacesCents}
            detail={t("billing.bill.spacesDetail_other", "{{count}} workspaces", { count: bill.spaces.length })}
          />
        </div>
      </div>
    </div>
  )
}

export function Legend({ colour, label, cents }: { colour: string; label: string; cents: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-sm", colour)} />
      {label} <b className="font-semibold tabular-nums text-foreground">{formatCents(cents)}</b>
    </span>
  )
}

export function Tile({
  icon,
  label,
  cents,
  detail,
}: {
  icon: React.ReactNode
  label: string
  cents: number
  detail: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">{formatCents(cents)}</p>
      <p className="text-[11px] tabular-nums text-muted-foreground">{detail}</p>
    </div>
  )
}
