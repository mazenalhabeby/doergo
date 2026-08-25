'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { MODULE_MONTHLY_CENTS, AVAILABLE_ADD_ONS, formatCents } from '@hbcfield/shared/client';
import { HOME_GROUPS, groupMonthlyCents } from '@/lib/capability-groups';

const MONO = 'font-[family:var(--font-martian)]';
const DISPLAY = 'font-[family:var(--font-familjen)]';
const ACCENT = '#5B9BD5';

/**
 * What you can switch on, grouped by the problem it solves.
 *
 * Twice wrong before this. First a tick-and-cross matrix, where every ✗ meant
 * "upgrade to unlock" — which cannot survive the tiers going away. Then the raw
 * price list: twenty-seven rows of feature names and numbers, which is accurate,
 * unreadable, and adds up in the reader's head to a total nobody would ever pay.
 *
 * A price list is a reference. Somebody deciding whether to buy is not reading a
 * reference — they are looking for the thing that fixes their problem and then
 * asking what it costs. So the modules are grouped by the JOB they do, named in
 * words a tradesperson uses rather than ours, and each group carries the one
 * number that matters: what it costs to switch that whole capability on.
 *
 * The individual prices are still there, under the group, for anybody who wants
 * to check the arithmetic. They are just no longer the first thing anyone reads.
 *
 * Every figure comes from the same table the product bills from, so this page
 * and an invoice cannot quote different numbers.
 *
 * The grouping itself lives in `@/lib/capability-groups`, shared with /pricing —
 * two copies would drift the first time a module moved between groups, and the
 * page that drifted would be the one a customer checks before paying.
 */

export function FeatureMatrix() {
  const { t } = useTranslation();

  const GROUPS = HOME_GROUPS.map((g) => ({
    ...g,
    title: t(`home.groups.${g.key}.title`, g.key),
    body: t(`home.groups.${g.key}.body`, ''),
    note: g.hasNote ? t(`home.groups.${g.key}.note`, '') : undefined,
  }));

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => {
        const isOffice = g.key === 'office';
        const items = isOffice
          ? AVAILABLE_ADD_ONS.filter((a) => (g.addOns ?? []).includes(a.key)).map((a) => ({
              key: a.key,
              label: t(`addOns.${a.key}.label`, a.label),
              cents: a.monthlyCents,
            }))
          : g.modules.map((k) => ({ key: k, label: t(`modules.${k}.label`, k), cents: MODULE_MONTHLY_CENTS[k] ?? 0 }));
        const from = isOffice ? Math.min(...items.map((i) => i.cents)) : groupMonthlyCents(g);

        return (
          <div key={g.key} className="flex flex-col rounded-2xl border border-foreground/[0.10] p-6">
            <span
              className="flex size-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT }}
            >
              {g.icon}
            </span>
            <h3 className={`${DISPLAY} mt-4 text-[19px] leading-snug tracking-[-0.01em] text-foreground`}>{g.title}</h3>
            <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-foreground/50">{g.body}</p>

            {/* The one number for the whole capability, not seven of them. */}
            <p className={`${MONO} mt-5 text-[13px] text-foreground [font-variant-numeric:tabular-nums]`}>
              <span style={{ color: ACCENT }}>
                {isOffice
                  ? t('home.groups.from', 'from {{price}}', { price: formatCents(from) })
                  : formatCents(from)}
              </span>
              <span className="text-foreground/40"> {t('home.groups.perSpace', '/ workspace / month')}</span>
            </p>

            {g.note && <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/35">{g.note}</p>}

            {/* The arithmetic, for anybody who wants to check it. */}
            <p className="mt-3 border-t border-foreground/[0.07] pt-3 text-[11.5px] leading-relaxed text-foreground/30">
              {items.map((i, n) => (
                <span key={i.key}>
                  {n > 0 && ' · '}
                  {i.label} {formatCents(i.cents)}
                </span>
              ))}
            </p>
          </div>
        );
        })}
      </div>

      <Link
        href="/pricing"
        className={`${MONO} group mt-8 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-foreground/45 transition-colors hover:text-foreground`}
      >
        {t('home.estimator.seeAll', 'See every price')}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
