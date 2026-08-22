'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AVAILABLE_MODULES,
  MODULE_MONTHLY_CENTS,
  MODULE_USAGE_PRICING,
  AVAILABLE_ADD_ONS,
  SEAT_MONTHLY_CENTS,
  orgMonthlyCost,
  formatCents,
  billsByUsage,
} from '@hbcfield/shared/client';

const DISPLAY = 'font-[family:var(--font-familjen)]';
const MONO = 'font-[family:var(--font-martian)]';
const ACCENT = '#5B9BD5';

/**
 * Work out what HBCField costs you, on the page, before talking to anyone.
 *
 * Three plan columns cannot describe this product — the bill is people plus
 * what each site switches on plus company add-ons, and a column can only show
 * one combination of those. The pattern that fits a modular, usage-priced
 * product is the one PostHog and Twilio settled on: let the visitor put their
 * own numbers in and watch the total move. It answers "what will this cost ME",
 * which is the only question a pricing page is ever really asked.
 *
 * PERFORMANCE. Every figure comes from pure functions in @hbcfield/shared that
 * are already in the bundle for the app itself, so this costs no network, no
 * API, and no new dependency. The whole thing is `useMemo` over four pieces of
 * local state — typing in it is a re-render of one card, not a request.
 *
 * The numbers are the SAME functions the invoice is built from. A pricing page
 * with its own arithmetic is a pricing page that eventually lies.
 */

/** Modules a visitor recognises without being sold to. Order is deliberate. */
const FEATURED = ['tracking', 'time_tracking', 'service_reports', 'assets', 'crm', 'b2c_portal'] as const;

/** Sensible starting point: a small field team that tracks its vans and reports. */
const DEFAULT_ON = new Set<string>(['tracking', 'time_tracking', 'service_reports']);

export function PricingEstimator() {
  const { t } = useTranslation();

  const [people, setPeople] = useState(6);
  const [spaces, setSpaces] = useState(1);
  const [modules, setModules] = useState<Set<string>>(DEFAULT_ON);
  const [addOns, setAddOns] = useState<Set<string>>(new Set());
  const [units, setUnits] = useState<Record<string, number>>({ assets: 40, crm: 120, b2c_portal: 1 });

  const bill = useMemo(() => {
    const enabled = [...modules];
    // The counts belong to ONE space — spreading them evenly across sites would
    // quietly reach cheaper ladder bands and quote a number the product won't
    // charge. Better to under-promise here than to explain a bigger invoice.
    const usageFor = (i: number): Record<string, number> =>
      i === 0 ? Object.fromEntries(enabled.filter(billsByUsage).map((k) => [k, units[k] ?? 0])) : {};

    return orgMonthlyCost({
      seatCount: people,
      spaces: Array.from({ length: spaces }, (_, i) => ({
        spaceId: String(i),
        spaceName: `Space ${i + 1}`,
        enabledModules: enabled,
        usage: usageFor(i),
      })),
      addOns: [...addOns],
    });
  }, [people, spaces, modules, addOns, units]);

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    apply(next);
  };

  const countedOn = [...modules].filter(billsByUsage);

  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-foreground/[0.10] bg-foreground/[0.08] lg:grid-cols-[1fr_minmax(19rem,22rem)]">
      {/* ── inputs ──────────────────────────────────────────────────────── */}
      <div className="bg-background p-6 sm:p-8">
        <Field
          label={t('home.estimator.people', 'People using HBCField')}
          value={people}
          min={1}
          max={120}
          onChange={setPeople}
          hint={t('home.estimator.peopleHint', '{{price}} each — office or field, same price', {
            price: formatCents(SEAT_MONTHLY_CENTS),
          })}
        />

        <Field
          label={t('home.estimator.spaces', 'Spaces')}
          value={spaces}
          min={1}
          max={25}
          onChange={setSpaces}
          hint={t(
            'home.estimator.spacesHint',
            'A site, a project, a client — however you divide up the work. Each pays only for what it switches on.',
          )}
        />

        <p className={`${MONO} mb-3 mt-8 text-[10px] uppercase tracking-[0.18em] text-foreground/35`}>
          {t('home.estimator.modules', 'Switch on what you need')}
        </p>
        <div className="flex flex-wrap gap-2">
          {FEATURED.map((key) => {
            const on = modules.has(key);
            const m = AVAILABLE_MODULES.find((x) => x.key === key)!;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(modules, key, setModules)}
                className={`${MONO} rounded-full border px-3.5 py-2 text-[11px] transition-colors ${
                  on
                    ? 'border-transparent text-[#04121f]'
                    : 'border-foreground/15 text-foreground/60 hover:border-foreground/40 hover:text-foreground'
                }`}
                style={on ? { backgroundColor: ACCENT } : undefined}
              >
                {t(`modules.${key}.label`, m.label)}
                <span className={on ? 'opacity-70' : 'opacity-50'}> {formatCents(MODULE_MONTHLY_CENTS[key] ?? 0)}</span>
              </button>
            );
          })}
        </div>

        {/* Only the counted modules that are actually ON get a number to set —
            asking for a client count from somebody who has not switched CRM on
            is asking a question that changes nothing. */}
        {countedOn.length > 0 && (
          <div className="mt-7 space-y-4 rounded-xl border border-foreground/[0.08] p-4">
            <p className={`${MONO} text-[10px] uppercase tracking-[0.18em] text-foreground/35`}>
              {t('home.estimator.howMany', 'How many — the price drops as it grows')}
            </p>
            {countedOn.map((key) => {
              const ladder = MODULE_USAGE_PRICING[key];
              const m = AVAILABLE_MODULES.find((x) => x.key === key)!;
              return (
                <Field
                  key={key}
                  compact
                  label={t(`modules.${key}.label`, m.label)}
                  value={units[key] ?? 0}
                  min={0}
                  max={key === 'b2c_portal' ? 20 : 3000}
                  step={key === 'b2c_portal' ? 1 : 10}
                  onChange={(v) => setUnits((u) => ({ ...u, [key]: v }))}
                  hint={t('home.estimator.included', 'first {{count}} included in the base price', { count: ladder.included })}
                />
              );
            })}
          </div>
        )}

        <p className={`${MONO} mb-3 mt-8 text-[10px] uppercase tracking-[0.18em] text-foreground/35`}>
          {t('home.estimator.addOns', 'Company-wide add-ons')}
        </p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_ADD_ONS.slice(0, 6).map((a) => {
            const on = addOns.has(a.key);
            return (
              <button
                key={a.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(addOns, a.key, setAddOns)}
                className={`${MONO} rounded-full border px-3.5 py-2 text-[11px] transition-colors ${
                  on
                    ? 'border-transparent text-[#04121f]'
                    : 'border-foreground/15 text-foreground/60 hover:border-foreground/40 hover:text-foreground'
                }`}
                style={on ? { backgroundColor: ACCENT } : undefined}
              >
                {t(`addOns.${a.key}.label`, a.label)}
                <span className={on ? 'opacity-70' : 'opacity-50'}> {formatCents(a.monthlyCents)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── the number ──────────────────────────────────────────────────── */}
      <aside className="bg-background p-6 sm:p-8 lg:sticky lg:top-8 lg:self-start">
        <p className={`${MONO} text-[10px] uppercase tracking-[0.18em] text-foreground/35`}>
          {t('home.estimator.yourCost', 'Your cost')}
        </p>

        {/* tabular-nums so the figure does not jitter as it changes */}
        <p className={`${DISPLAY} mt-3 text-[clamp(2.4rem,7vw,3.4rem)] font-normal leading-none tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]`}>
          {formatCents(bill.monthlyCents)}
        </p>
        <p className={`${MONO} mt-2 text-[11px] text-foreground/40`}>
          {t('home.estimator.perMonth', '/ month, excl. VAT')}
        </p>

        <div className="mt-6 space-y-2 border-t border-foreground/[0.08] pt-5 text-[13px]">
          <Row label={t('home.estimator.rowPeople', '{{count}} people', { count: people })} value={bill.seatMonthlyCents} />
          <Row
            label={t('home.estimator.rowSpaces_other', '{{count}} spaces', { count: spaces })}
            value={bill.spacesMonthlyCents}
          />
          {bill.usageMonthlyCents > 0 && (
            <Row label={t('home.estimator.rowUsage', 'What is in them')} value={bill.usageMonthlyCents} accent />
          )}
          {bill.addOnsMonthlyCents > 0 && (
            <Row label={t('home.estimator.rowAddOns', 'Add-ons')} value={bill.addOnsMonthlyCents} />
          )}
        </div>

        <div className="mt-5 rounded-lg bg-foreground/[0.04] p-3">
          <p className={`${MONO} text-[11px] leading-relaxed text-foreground/50`}>
            {t('home.estimator.annual', '{{price}} a year — two months free', {
              price: formatCents(bill.annualCents),
            })}
          </p>
          <p className={`${MONO} mt-1 text-[11px] leading-relaxed text-foreground/40`}>
            {t('home.estimator.perHead', '{{price}} per person', {
              price: formatCents(Math.round(bill.monthlyCents / Math.max(1, people))),
            })}
          </p>
        </div>

        <p className="mt-5 text-[12px] leading-relaxed text-foreground/40">
          {t(
            'home.estimator.note',
            'Counts are priced per space, so this assumes they sit in one. 14-day trial, no card, and every module can be switched off the day you stop using it.',
          )}
        </p>
      </aside>
    </div>
  );
}

/** A number you set — a slider for reach, a readout that stays legible. */
function Field({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
  compact,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'mb-7'}>
      <div className="flex items-baseline justify-between gap-4">
        <label className={`text-[13.5px] ${compact ? 'text-foreground/70' : 'font-medium text-foreground'}`}>
          {label}
        </label>
        <span className={`${MONO} text-[13px] text-foreground [font-variant-numeric:tabular-nums]`}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-[#5B9BD5]"
      />
      {hint && <p className={`${MONO} mt-1.5 text-[10.5px] text-foreground/35`}>{hint}</p>}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-foreground/50">{label}</span>
      <span
        className={`${MONO} text-[12.5px] [font-variant-numeric:tabular-nums] ${accent ? '' : 'text-foreground/80'}`}
        style={accent ? { color: ACCENT } : undefined}
      >
        {formatCents(value)}
      </span>
    </div>
  );
}
