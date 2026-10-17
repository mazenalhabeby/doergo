'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import {
  AVAILABLE_MODULES,
  MODULE_MONTHLY_CENTS,
  MODULE_USAGE_PRICING,
  formatCents,
  usageCost,
} from '@hbcfield/shared/client';

/** PricingClient's module-level helpers, moved here unchanged so its sections can read them too. */
export const DISPLAY = 'font-[family:var(--font-familjen)]';

export const MONO = 'font-[family:var(--font-martian)]';

export const ACCENT = '#5B9BD5';

/* ── pieces ──────────────────────────────────────────────────────────────── */

export function SectionHead({ n, title, lead }: { n: string; title: string; lead?: string }) {
  return (
    <div>
      <p className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-foreground/35`}>({n})</p>
      <h2 className={`${DISPLAY} mt-5 max-w-[22ch] text-[clamp(1.7rem,4vw,2.8rem)] font-normal leading-[1.06] tracking-[-0.02em]`}>
        {title}
      </h2>
      {lead && <p className="mt-5 max-w-[62ch] text-[15.5px] leading-relaxed text-foreground/50">{lead}</p>}
    </div>
  );
}

export function PartCard({ icon, n, title, price, body }: { icon: React.ReactNode; n: string; title: string; price: string; body: string }) {
  return (
    <div className="rounded-2xl border border-foreground/[0.10] p-6">
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT }}>
          {icon}
        </span>
        <span className={`${MONO} text-[11px] text-foreground/25`}>{n}</span>
      </div>
      <h3 className={`${DISPLAY} mt-4 text-[17px] tracking-[-0.01em]`}>{title}</h3>
      <p className={`${MONO} mt-1 text-[13px] [font-variant-numeric:tabular-nums]`} style={{ color: ACCENT }}>
        {price}
      </p>
      <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/50">{body}</p>
    </div>
  );
}

export function ModuleRow({ moduleKey, first }: { moduleKey: string; first: boolean }) {
  const { t } = useTranslation();
  const def = AVAILABLE_MODULES.find((m) => m.key === moduleKey);
  const counted = moduleKey in MODULE_USAGE_PRICING;

  return (
    <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 sm:px-6 ${first ? '' : 'border-t border-foreground/[0.07]'}`}>
      <span className="min-w-[10rem] text-[14.5px] text-foreground">{t(`modules.${moduleKey}.label`, def?.label ?? moduleKey)}</span>
      <span className="flex-1 text-[13px] leading-relaxed text-foreground/45">
        {t(`modules.${moduleKey}.description`, def?.description ?? '')}
      </span>
      <span className={`${MONO} whitespace-nowrap text-[13px] text-foreground [font-variant-numeric:tabular-nums]`}>
        {formatCents(MODULE_MONTHLY_CENTS[moduleKey] ?? 0)}
        <span className="text-foreground/35"> {t('pricing.perSite', '/ site / mo')}</span>
        {counted && <span className="text-foreground/35"> {t('pricing.plusCount', '+ count')}</span>}
      </span>
    </div>
  );
}

/** One ladder, with a worked example so the bands are not just a table. */
export function LadderCard({ moduleKey }: { moduleKey: string }) {
  const { t } = useTranslation();
  const price = MODULE_USAGE_PRICING[moduleKey];
  const example = moduleKey === 'crm' ? 400 : moduleKey === 'assets' ? 120 : 4;
  const cost = usageCost(moduleKey, example);

  return (
    <div className="flex flex-col rounded-2xl border border-foreground/[0.10] p-6">
      <h3 className={`${DISPLAY} text-[18px] tracking-[-0.01em]`}>{t(`modules.${moduleKey}.label`, moduleKey)}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-foreground/45">
        {t('pricing.ladder.included', {
          count: price.included,
          price: formatCents(MODULE_MONTHLY_CENTS[moduleKey] ?? 0),
          defaultValue: 'The {{price}} module covers the first {{count}}.',
        })}
      </p>

      <div className={`${MONO} mt-5 space-y-1.5 text-[12px] [font-variant-numeric:tabular-nums]`}>
        {price.bands.map((b, i) => {
          const from = (i === 0 ? price.included : (price.bands[i - 1].upTo ?? 0)) + 1;
          return (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-foreground/45">
                {b.upTo == null
                  ? t('pricing.ladder.bandOpen', '{{from}} and up', { from })
                  : t('pricing.ladder.band', '{{from}} – {{to}}', { from, to: b.upTo })}
              </span>
              <span className="text-foreground">{formatCents(b.unitCents)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto border-t border-foreground/[0.08] pt-4">
        <p className={`${MONO} text-[12px] text-foreground/40`}>{t('pricing.ladder.example', 'For example')}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/60">
          {t('pricing.ladder.exampleBody', '{{n}} of them add {{total}} a month — about {{each}} each.', {
            n: example,
            total: formatCents(cost.monthlyCents),
            each: formatCents(Math.round(cost.effectiveUnitCents)),
          })}
        </p>
      </div>
    </div>
  );
}

export function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-foreground/[0.08]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className={`${DISPLAY} text-[16.5px] leading-snug tracking-[-0.01em]`}>{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-foreground/35 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="-mt-1 pb-5 pr-8 text-[14.5px] leading-relaxed text-foreground/55">{a}</p>}
    </div>
  );
}
