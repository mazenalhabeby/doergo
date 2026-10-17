"use client";

import { BadgeCheck, Boxes, Users, Eye, UserCog } from "lucide-react";
import { formatCents, SEAT_MONTHLY_CENTS, OBSERVER_SEAT_MONTHLY_CENTS } from "@hbcfield/shared/client";
import { dateLocale } from "@/lib/format-date";
import { Legend, Tile } from "./bill-breakdown-helpers";
import type { BillBreakdownState } from "./use-bill-breakdown";
import type { BillBreakdown } from "./bill-breakdown";

/** Part of BillBreakdown's markup, moved here unchanged; it reads the page's state from `vm`. */
export function BillBreakdownBill({ vm, estimate, bill }: { vm: BillBreakdownState; estimate: Parameters<typeof BillBreakdown>[0]['estimate']; bill: Parameters<typeof BillBreakdown>[0]['bill'] }) {
  const { t, listTotal, share, spacesCents, peopleCents } = vm;
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
      {/* One soft wash behind the content, inert to pointers. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,hsl(var(--primary)/0.10),transparent_60%)]"
      />
      <div className="relative">
        <p className="text-sm text-muted-foreground">
          {estimate ? t('billing.bill.estimate', 'At list price') : t('billing.bill.total', 'Your monthly total')}
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {formatCents(bill.monthlyCents)}
          <span className="ml-1 text-base font-normal text-muted-foreground">
            {t('billing.bill.perMonth', '/month')}
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
              {t('billing.agreed.title', 'You are on an agreed price')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t('billing.agreed.body', 'Your usage would otherwise come to {{list}} a month.', {
                list: formatCents(listTotal),
              })}
              {bill.agreement.until && (
                <>
                  {' '}
                  {t('billing.agreed.until', 'This rate holds until {{date}}.', {
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
          {t('billing.bill.exVat', 'Excludes VAT — tax is added at checkout, at the rate for your country.')}
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
              <Legend colour="bg-violet-500" label={t('billing.bill.spaces', 'Workspaces')} cents={spacesCents} />
              <Legend colour="bg-pink-500" label={t('billing.bill.addOns', 'Options')} cents={bill.addOnsMonthlyCents} />
              <Legend colour="bg-primary" label={t('billing.bill.seats', 'People')} cents={peopleCents} />
            </div>
          </>
        )}

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            icon={<Users className="h-4 w-4" />}
            label={t('billing.bill.seats', 'People')}
            cents={bill.staffSeatCount * SEAT_MONTHLY_CENTS}
            detail={t('billing.bill.seatsDetail', '{{count}} × {{price}}', {
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
              label={t('billing.bill.externalSeats', 'External supervisors')}
              cents={bill.externalSeatCount * SEAT_MONTHLY_CENTS}
              detail={t('billing.bill.seatsDetail', '{{count}} × {{price}}', {
                count: bill.externalSeatCount,
                price: formatCents(SEAT_MONTHLY_CENTS),
              })}
            />
          )}
          {bill.observerSeatCount > 0 && (
            <Tile
              icon={<Eye className="h-4 w-4" />}
              label={t('billing.bill.observerSeats', 'External observers')}
              cents={bill.observerSeatMonthlyCents}
              detail={t('billing.bill.seatsDetail', '{{count}} × {{price}}', {
                count: bill.observerSeatCount,
                price: formatCents(OBSERVER_SEAT_MONTHLY_CENTS),
              })}
            />
          )}
          <Tile
            icon={<Boxes className="h-4 w-4" />}
            label={t('billing.bill.spaces', 'Workspaces')}
            cents={spacesCents}
            detail={t('billing.bill.spacesDetail_other', '{{count}} workspaces', { count: bill.spaces.length })}
          />
        </div>
      </div>
    </div>
  );
}
