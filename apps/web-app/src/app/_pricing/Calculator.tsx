'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ChevronDown, Check } from 'lucide-react';
import {
  AVAILABLE_ADD_ONS,
  MODULE_MONTHLY_CENTS,
  SEAT_MONTHLY_CENTS,
  orgMonthlyCost,
  formatCents,
  billsByUsage,
  includedUnits,
  usagePriceFor,
  nextUsageBreak,
} from '@hbcfield/shared/client';
import { CAPABILITY_GROUPS, groupMonthlyCents } from '@/lib/capability-groups';
import { useCalculator, type Site, STARTER_MODULES } from './use-calculator';
import { DISPLAY, MONO, Panel, Line, Chip, SiteCard } from './calculator-helpers';

let nextId = 2;

export function Calculator() {
  const {
    t,
    people,
    setPeople,
    sites,
    setSites,
    addOns,
    setAddOns,
    openBill,
    setOpenBill,
    bill,
    perPerson,
    setSite,
    toggleModule,
    toggleGroup,
  } = useCalculator();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      {/* ═══ what you have ═══════════════════════════════════════════════ */}
      <div className="space-y-8">
        {/* people */}
        <Panel step="1" title={t('pricing.calc.peopleTitle', 'How many people will use it?')}>
          <p className="text-[13.5px] leading-relaxed text-foreground/50">
            {t('pricing.calc.peopleBody', 'Everyone counts the same — office, field, owner. {{price}} each, per month.', {
              price: formatCents(SEAT_MONTHLY_CENTS),
            })}
          </p>
          <div className="mt-5 flex items-center gap-5">
            <input
              aria-label={t('pricing.calc.peopleTitle', 'How many people will use it?')}
              type="range"
              min={1}
              max={100}
              value={people}
              onChange={(e) => setPeople(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-[#5B9BD5]"
            />
            <span className={`${DISPLAY} w-14 shrink-0 text-right text-[2rem] leading-none text-foreground [font-variant-numeric:tabular-nums]`}>
              {people}
            </span>
          </div>
        </Panel>

        {/* sites */}
        <Panel
          step="2"
          title={t('pricing.calc.sitesTitle', 'What should each site be able to do?')}
        >
          <p className="text-[13.5px] leading-relaxed text-foreground/50">
            {t(
              'pricing.calc.sitesBody',
              'A site is one place or operation you run — a branch, a building, a contract, a crew. Each one pays only for what it switches on, so a quiet site stays cheap.',
            )}
          </p>

          <div className="mt-6 space-y-5">
            {sites.map((site, i) => (
              <SiteCard
                key={site.id}
                index={i}
                site={site}
                removable={sites.length > 1}
                onRemove={() => setSites((prev) => prev.filter((s) => s.id !== site.id))}
                onToggleModule={(k) => toggleModule(site.id, k)}
                onToggleGroup={(keys) => toggleGroup(site.id, keys)}
                onCount={(k, n) => setSite(site.id, (s) => ({ ...s, units: { ...s.units, [k]: n } }))}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSites((prev) => [...prev, { id: String(nextId++), modules: [...STARTER_MODULES], units: {} }])}
            className={`${MONO} mt-5 inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground`}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('pricing.calc.addSite', 'Add another site')}
          </button>
        </Panel>

        {/* add-ons */}
        <Panel step="3" title={t('pricing.calc.addOnsTitle', 'Anything for the whole company?')}>
          <p className="text-[13.5px] leading-relaxed text-foreground/50">
            {t(
              'pricing.calc.addOnsBody',
              'These are bought once and work everywhere. However many sites you run, you pay for each of them once.',
            )}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {AVAILABLE_ADD_ONS.map((a) => {
              const on = addOns.includes(a.key);
              return (
                <Chip
                  key={a.key}
                  on={on}
                  label={t(`addOns.${a.key}.label`, a.label)}
                  price={formatCents(a.monthlyCents)}
                  title={t(`addOns.${a.key}.description`, a.description)}
                  onClick={() =>
                    setAddOns((prev) => (on ? prev.filter((k) => k !== a.key) : [...prev, a.key]))
                  }
                />
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ═══ what it costs ═══════════════════════════════════════════════ */}
      <div className="lg:sticky lg:top-24">
        <div className="rounded-2xl border border-foreground/[0.12] bg-background p-6 sm:p-7">
          <p className={`${DISPLAY} text-[clamp(2.4rem,7vw,3.4rem)] font-normal leading-none tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]`}>
            {formatCents(bill.monthlyCents)}
          </p>
          <p className={`${MONO} mt-2 text-[11.5px] text-foreground/45`}>
            {t('pricing.calc.aMonth', 'a month')}
          </p>

          <div className="mt-5 flex items-baseline gap-2 border-t border-foreground/[0.08] pt-5">
            <span className={`${DISPLAY} text-[1.6rem] leading-none text-foreground [font-variant-numeric:tabular-nums]`}>
              {formatCents(perPerson)}
            </span>
            <span className="text-[13px] text-foreground/50">
              {t('pricing.calc.perPerson', 'per person, per month')}
            </span>
          </div>

          {/* the itemised bill */}
          <button
            type="button"
            onClick={() => setOpenBill((o) => !o)}
            aria-expanded={openBill}
            className={`${MONO} mt-6 inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-foreground/45 transition-colors hover:text-foreground`}
          >
            {t('pricing.calc.breakdown', 'Where it comes from')}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openBill ? 'rotate-180' : ''}`} />
          </button>

          {openBill && (
            <div className={`${MONO} mt-4 space-y-4 text-[12px] [font-variant-numeric:tabular-nums]`}>
              <Line
                label={t('pricing.calc.seatsLine', '{{count}} people × {{price}}', {
                  count: people,
                  price: formatCents(SEAT_MONTHLY_CENTS),
                })}
                cents={bill.seatMonthlyCents}
                strong
              />

              {bill.spaces.map((s, i) => (
                <div key={s.spaceId} className="border-t border-foreground/[0.07] pt-4">
                  <Line
                    label={t('pricing.calc.siteN', 'Site {{n}}', { n: i + 1 })}
                    cents={s.cost.monthlyCents}
                    strong
                  />
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
                        label={t('pricing.calc.overAllowance', '{{n}} over the {{included}} included', {
                          n: u.billableUnits,
                          included: u.included,
                        })}
                        cents={u.monthlyCents}
                        dim
                      />
                    ))}
                    {s.cost.lines.length === 0 && (
                      <p className="text-foreground/30">{t('pricing.calc.nothingOn', 'nothing switched on')}</p>
                    )}
                  </div>
                </div>
              ))}

              {bill.addOns.length > 0 && (
                <div className="border-t border-foreground/[0.07] pt-4">
                  <Line
                    label={t('pricing.calc.companyWide', 'Company-wide')}
                    cents={bill.addOnsMonthlyCents}
                    strong
                  />
                  <div className="mt-2 space-y-1 pl-3">
                    {bill.addOns.map((a) => (
                      <Line key={a.key} label={t(`addOns.${a.key}.label`, a.key)} cents={a.monthlyCents} dim />
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-foreground/[0.12] pt-4">
                <Line label={t('pricing.calc.total', 'Every month')} cents={bill.monthlyCents} strong />
              </div>
            </div>
          )}

          <p className="mt-6 border-t border-foreground/[0.08] pt-5 text-[12.5px] leading-relaxed text-foreground/45">
            {t('pricing.calc.footnote', 'Prices exclude VAT. 14 days free, no card. Change anything any time — the bill follows the same day.')}
          </p>
        </div>
      </div>
    </div>
  );
}
