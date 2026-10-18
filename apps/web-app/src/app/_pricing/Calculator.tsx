'use client';

import { Plus } from 'lucide-react';
import { AVAILABLE_ADD_ONS, SEAT_MONTHLY_CENTS, formatCents } from '@hbcfield/shared/client';
import { useCalculator, STARTER_MODULES } from './use-calculator';
import { DISPLAY, MONO, Panel, Chip, SiteCard } from './calculator-helpers';
import { CalculatorCalc } from './calculator-calc';

let nextId = 2;

export function Calculator() {
  const vm = useCalculator();
  const {
    t,
    people,
    setPeople,
    sites,
    setSites,
    addOns,
    setAddOns,
    setSite,
    toggleModule,
    toggleGroup,
  } = vm;

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
            <span
              className={(`${DISPLAY} w-14 shrink-0 text-right text-[2rem] leading-none ` +
                `text-foreground [font-variant-numeric:tabular-nums]`)}>
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
              ('A site is one place or operation you run — a branch, a building, a ' +
                'contract, a crew. Each one pays only for what it switches on, so a quiet ' +
                'site stays cheap.'),
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
            className={(`${MONO} mt-5 inline-flex items-center gap-2 rounded-full border ` +
              `border-foreground/15 px-4 py-2 text-[11px] uppercase tracking-[0.16em] ` +
              `text-foreground/60 transition-colors hover:border-foreground/40 ` +
              `hover:text-foreground`)}
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
      <CalculatorCalc vm={vm} />
    </div>
  );
}
