'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Boxes, Users, Eye, UserCog } from 'lucide-react';
import {
  AVAILABLE_MODULES,
  formatCents,
  moduleI18n,
  SEAT_MONTHLY_CENTS,
  OBSERVER_SEAT_MONTHLY_CENTS,
  type OrgCostBreakdown,
} from '@hbcfield/shared/client';

import { cn } from '@/lib/utils';
import { dateLocale } from "@/lib/format-date"
import { useBillBreakdown } from "./use-bill-breakdown";
import { SectionHead, Legend, Tile, PersonRow } from "./bill-breakdown-helpers";
import { BillBreakdownBill } from "./bill-breakdown-bill";

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
  const vm = useBillBreakdown({ bill, estimate });
  const {
    t,
    moduleLabel,
    peopleCents,
    spacesCents,
    headcount,
    listTotal,
    share,
  } = vm;

  return (
    <div className="space-y-4">
      {/* ── the total ─────────────────────────────────────────────────────── */}
      <BillBreakdownBill vm={vm} estimate={estimate} bill={bill} />

      {/* ── what is switched on, workspace by workspace ───────────────────── */}
      {bill.spaces.length > 0 && (
        <section>
          <SectionHead
            title={t('billing.bill.whatsActive', "What's active")}
            scope={t('billing.scope.perWorkspace', 'Per workspace')}
            aside={t('billing.bill.spacesSummary', '{{count}} workspaces · {{price}}', {
              count: bill.spaces.length,
              price: formatCents(spacesCents),
            })}
          />
          <ul className="space-y-2.5">
            {bill.spaces.map((s) => {
              const usage = s.cost.usage.filter((u) => u.monthlyCents > 0);
              const empty = s.cost.lines.length === 0 && usage.length === 0;
              return (
                <li
                  key={s.spaceId}
                  className={cn(
                    'rounded-xl border border-border bg-card',
                    // A free workspace is worth seeing, and worth seeing as
                    // quieter than the ones costing money.
                    empty && 'opacity-60',
                  )}
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-violet-500/10 text-[11px] font-bold text-violet-500"
                      >
                        {s.spaceName.trim().charAt(0).toUpperCase() || '·'}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">{s.spaceName}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatCents(s.cost.monthlyCents)}
                    </span>
                  </div>

                  {empty ? (
                    <p className="px-4 pb-3 text-xs text-muted-foreground">
                      {t('billing.bill.noModules', 'Nothing switched on — this workspace is free')}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                      {s.cost.lines.map((l) => (
                        <span
                          key={l.moduleKey}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                        >
                          {moduleLabel(l.moduleKey)}
                          <b className="font-semibold tabular-nums text-foreground">{formatCents(l.monthlyCents)}</b>
                        </span>
                      ))}
                      {usage.map((u) => (
                        <span
                          key={`u-${u.moduleKey}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400"
                        >
                          {t('billing.bill.usageLine', '{{module}} usage {{price}}', {
                            module: moduleLabel(u.moduleKey),
                            price: formatCents(u.monthlyCents),
                          })}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── people, itemised ──────────────────────────────────────────────── */}
      <section>
        <SectionHead
          title={t('billing.bill.seats', 'People')}
          scope={t('billing.scope.perPerson', 'Per person')}
          aside={t('billing.bill.peopleSummary', '{{count}} accounts · {{price}}', {
            count: headcount,
            price: formatCents(peopleCents),
          })}
        />
        <div className="rounded-xl border border-border bg-card">
          <PersonRow
            label={t('billing.bill.staffSeats', 'Staff')}
            count={bill.staffSeatCount}
            each={SEAT_MONTHLY_CENTS}
            cents={bill.staffSeatCount * SEAT_MONTHLY_CENTS}
          />
          {bill.externalSeatCount > 0 && (
            <PersonRow
              label={t('billing.bill.externalSeats', 'External supervisors')}
              tag={t('billing.bill.externalTag', 'client staff')}
              tagCls="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              count={bill.externalSeatCount}
              each={SEAT_MONTHLY_CENTS}
              cents={bill.externalSeatCount * SEAT_MONTHLY_CENTS}
            />
          )}
          {bill.observerSeatCount > 0 && (
            <PersonRow
              label={t('billing.bill.observerSeats', 'External observers')}
              tag={t('billing.bill.observerTag', 'watches only')}
              tagCls="bg-teal-500/10 text-teal-600 dark:text-teal-400"
              count={bill.observerSeatCount}
              each={OBSERVER_SEAT_MONTHLY_CENTS}
              cents={bill.observerSeatMonthlyCents}
            />
          )}
        </div>
      </section>
    </div>
  );
}
