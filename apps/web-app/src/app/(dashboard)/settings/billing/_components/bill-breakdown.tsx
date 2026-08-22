'use client';

import { useTranslation } from 'react-i18next';
import { Boxes, Users, Puzzle } from 'lucide-react';
import {
  AVAILABLE_MODULES,
  formatCents,
  moduleI18n,
  SEAT_MONTHLY_CENTS,
  addOnDef,
  addOnI18n,
  type OrgCostBreakdown,
} from '@hbcfield/shared/client';

/**
 * Where the money goes.
 *
 * The old page showed three plan columns and a price per seat — which answered
 * "what could I buy?" and never "why is my bill this?". With modules bought per
 * space and capabilities bought once, the second question is the only one a
 * customer actually opens this page with, and it has a real answer now: every
 * line is something somebody switched on, in a place they can go and switch off.
 *
 * Nothing is computed here. Every figure comes from the same breakdown the
 * Stripe sync is built from, so the screen cannot disagree with the invoice —
 * which is exactly what the tier model allowed.
 */
export function BillBreakdown({ bill, estimate }: { bill: OrgCostBreakdown; estimate?: boolean }) {
  const { t } = useTranslation();

  const moduleLabel = (key: string) => {
    const english = AVAILABLE_MODULES.find((m) => m.key === key)?.label ?? key;
    return t(moduleI18n.label(key), { defaultValue: english });
  };

  const addOnLabel = (key: string) => {
    const def = addOnDef(key);
    return t(addOnI18n.label(key), { defaultValue: def?.label ?? key });
  };

  return (
    <div className="space-y-4">
      {/* ── the total ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {estimate
                ? t('billing.bill.estimate', 'At list price')
                : t('billing.bill.total', 'Your monthly total')}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
              {formatCents(bill.monthlyCents)}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                {t('billing.bill.perMonth', '/month')}
              </span>
            </p>
          </div>
        </div>

        {/* The three parts, so the total can be checked rather than trusted. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Part
            icon={<Users className="h-4 w-4" />}
            label={t('billing.bill.seats', 'People')}
            detail={t('billing.bill.seatsDetail', '{{count}} × {{price}}', {
              count: bill.seatCount,
              price: formatCents(SEAT_MONTHLY_CENTS),
            })}
            cents={bill.seatMonthlyCents}
          />
          <Part
            icon={<Boxes className="h-4 w-4" />}
            label={t('billing.bill.spaces', 'Spaces')}
            detail={t('billing.bill.spacesDetail_other', '{{count}} spaces', { count: bill.spaces.length })}
            cents={bill.spacesMonthlyCents + bill.usageMonthlyCents}
          />
          <Part
            icon={<Puzzle className="h-4 w-4" />}
            label={t('billing.bill.addOns', 'Add-ons')}
            detail={t('billing.bill.addOnsDetail_other', '{{count}} bought', { count: bill.addOns.length })}
            cents={bill.addOnsMonthlyCents}
          />
        </div>
      </div>

      {/* ── every space, itemised ─────────────────────────────────────────── */}
      {bill.spaces.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <p className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
            {t('billing.bill.bySpace', 'By space')}
          </p>
          <ul className="divide-y divide-border">
            {bill.spaces.map((s) => {
              const hasUsage = s.cost.usage.some((u) => u.monthlyCents > 0);
              return (
                <li key={s.spaceId} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-foreground">{s.spaceName}</span>
                    <span className="shrink-0 text-sm tabular-nums text-foreground">
                      {formatCents(s.cost.monthlyCents)}
                    </span>
                  </div>
                  {(s.cost.lines.length > 0 || hasUsage) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {s.cost.lines.map((l) => (
                        <span key={l.moduleKey} className="tabular-nums">
                          {moduleLabel(l.moduleKey)} {formatCents(l.monthlyCents)}
                        </span>
                      ))}
                      {s.cost.usage
                        .filter((u) => u.monthlyCents > 0)
                        .map((u) => (
                          <span key={`u-${u.moduleKey}`} className="tabular-nums text-amber-600 dark:text-amber-400">
                            {t('billing.bill.usageLine', '{{module}} usage {{price}}', {
                              module: moduleLabel(u.moduleKey),
                              price: formatCents(u.monthlyCents),
                            })}
                          </span>
                        ))}
                    </div>
                  )}
                  {s.cost.lines.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('billing.bill.noModules', 'Nothing switched on — this space is free')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── add-ons, itemised ─────────────────────────────────────────────── */}
      {bill.addOns.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <p className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground">
            {t('billing.bill.addOnsBought', 'Add-ons')}
          </p>
          <ul className="divide-y divide-border">
            {bill.addOns.map((a) => (
              <li key={a.key} className="flex items-baseline justify-between gap-3 px-5 py-2.5">
                <span className="truncate text-sm text-foreground">{addOnLabel(a.key)}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatCents(a.monthlyCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Part({
  icon,
  label,
  detail,
  cents,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  cents: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCents(cents)}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
