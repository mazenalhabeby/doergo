'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown, Check } from 'lucide-react';
import {
  MODULE_MONTHLY_CENTS,
  formatCents,
  billsByUsage,
  includedUnits,
  usagePriceFor,
  nextUsageBreak,
} from '@hbcfield/shared/client';
import { CAPABILITY_GROUPS, groupMonthlyCents } from '@/lib/capability-groups';
import { type Site } from './use-calculator';

/** Calculator's module-level helpers, moved here unchanged so its sections can read them too. */
export const DISPLAY = 'font-[family:var(--font-familjen)]';

export const MONO = 'font-[family:var(--font-martian)]';

export const ACCENT = '#5B9BD5';

/* ── pieces ──────────────────────────────────────────────────────────────── */

export function Panel({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-foreground/[0.10] p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className={`${MONO} flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]`}
          style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT }}
        >
          {step}
        </span>
        <h3 className={`${DISPLAY} text-[19px] leading-snug tracking-[-0.01em] text-foreground`}>{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Line({ label, cents, strong, dim }: { label: string; cents: number; strong?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? 'text-foreground' : dim ? 'text-foreground/45' : 'text-foreground/70'}>{label}</span>
      <span className={strong ? 'text-foreground' : 'text-foreground/45'}>{formatCents(cents)}</span>
    </div>
  );
}

export function Chip({
  on,
  label,
  price,
  title,
  onClick,
}: {
  on: boolean;
  label: string;
  price: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`${MONO} inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
        on
          ? 'border-transparent text-[#04121f]'
          : 'border-foreground/15 text-foreground/55 hover:border-foreground/40 hover:text-foreground'
      }`}
      style={on ? { backgroundColor: ACCENT } : undefined}
    >
      {on && <Check className="h-3 w-3" />}
      {label}
      <span className={on ? 'opacity-70' : 'opacity-45'}>{price}</span>
    </button>
  );
}

export function SiteCard({
  index,
  site,
  removable,
  onRemove,
  onToggleModule,
  onToggleGroup,
  onCount,
}: {
  index: number;
  site: Site;
  removable: boolean;
  onRemove: () => void;
  onToggleModule: (key: string) => void;
  onToggleGroup: (keys: string[]) => void;
  onCount: (key: string, n: number) => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-foreground/[0.10] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className={`${DISPLAY} text-[15px] text-foreground`}>
          {t('pricing.calc.siteN', 'Site {{n}}', { n: index + 1 })}
        </p>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('pricing.calc.removeSite', 'Remove this site')}
            className={"inline-flex size-7 items-center justify-center rounded-full " +
              "text-foreground/35 transition-colors hover:bg-foreground/10 " +
              "hover:text-foreground"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {CAPABILITY_GROUPS.filter((g) => g.modules.length > 0).map((g) => {
          const on = g.modules.every((k) => site.modules.includes(k));
          const partial = !on && g.modules.some((k) => site.modules.includes(k));
          const open = detail === g.key;
          const counted = g.modules.filter((k) => billsByUsage(k) && site.modules.includes(k));

          return (
            <div
              key={g.key}
              className={`rounded-lg border transition-colors ${on || partial
                ? 'border-[#5B9BD5]/40 bg-[#5B9BD5]/[0.05]'
                : 'border-foreground/[0.09]'}`}>
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => onToggleGroup(g.modules)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? '' : 'bg-foreground/15'}`}
                  style={on ? { backgroundColor: ACCENT } : undefined}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? 'left-[1.125rem]' : 'left-0.5'}`}
                  />
                </button>

                <button type="button" onClick={() => setDetail(open ? null : g.key)} className="flex flex-1 items-center gap-2 text-left">
                  <span style={{ color: on || partial ? ACCENT : undefined }} className={on || partial ? '' : 'text-foreground/40'}>
                    {g.icon}
                  </span>
                  <span className="flex-1 text-[13.5px] text-foreground">{t(`home.groups.${g.key}.title`, g.key)}</span>
                  <span className={`${MONO} text-[11.5px] text-foreground/40 [font-variant-numeric:tabular-nums]`}>
                    {formatCents(groupMonthlyCents(g))}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 text-foreground/30 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* A count is only ever asked for once its module is on — asking
                  somebody without CRM how many customers they have is a question
                  that changes nothing on the screen. */}
              {counted.map((k) => (
                <CountRow key={k} moduleKey={k} value={site.units[k] ?? 0} onChange={(n) => onCount(k, n)} />
              ))}

              {open && (
                <div className="border-t border-foreground/[0.07] px-3 pb-3 pt-3">
                  <p className="mb-3 text-[12.5px] leading-relaxed text-foreground/45">
                    {t(`home.groups.${g.key}.body`, '')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.modules.map((k) => (
                      <Chip
                        key={k}
                        on={site.modules.includes(k)}
                        label={t(`modules.${k}.label`, k)}
                        price={formatCents(MODULE_MONTHLY_CENTS[k] ?? 0)}
                        title={t(`modules.${k}.description`, '')}
                        onClick={() => onToggleModule(k)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CountRow({ moduleKey, value, onChange }: { moduleKey: string; value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  const price = usagePriceFor(moduleKey);
  if (!price) return null;

  const free = includedUnits(moduleKey);
  const brk = nextUsageBreak(moduleKey, value);
  const max = moduleKey === 'crm' ? 2000 : moduleKey === 'assets' ? 500 : 20;

  return (
    <div className="border-t border-foreground/[0.07] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`c-${moduleKey}`} className="text-[12.5px] text-foreground/60">
          {t(`pricing.units.${price.unit}`, { count: value, defaultValue: `How many ${price.unit}s?` })}
        </label>
        <span className={`${MONO} text-[12.5px] text-foreground [font-variant-numeric:tabular-nums]`}>{value}</span>
      </div>
      <input
        id={`c-${moduleKey}`}
        type="range"
        min={0}
        max={max}
        value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-[#5B9BD5]"
      />
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-foreground/35">
        {value <= free
          ? t('pricing.calc.allFree', { count: free, defaultValue: 'The first {{count}} are included in the module.' })
          : brk
            ? t('pricing.calc.nextBreak', '{{away}} more and every one after that is {{price}}.', {
                away: brk.unitsAway,
                price: formatCents(brk.unitCents),
              })
            : t('pricing.calc.cheapestBand', "You're on the cheapest rate there is.")}
      </p>
    </div>
  );
}
