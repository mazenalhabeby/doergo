'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import {
  AVAILABLE_MODULES,
  MODULE_MONTHLY_CENTS,
  AVAILABLE_ADD_ONS,
  orgMonthlyCost,
  formatCents,
  billsByUsage,
} from '@hbcfield/shared/client';

const DISPLAY = 'font-[family:var(--font-familjen)]';
const MONO = 'font-[family:var(--font-martian)]';
const ACCENT = '#5B9BD5';

/**
 * What HBCField costs you — answered before you touch anything.
 *
 * The first version asked eleven questions: two sliders, six module chips,
 * three more sliders, six add-on chips. That is a FORM, and a form is work.
 * Somebody who has never heard of a "module" arrives wanting one number and is
 * handed a configuration exercise, then a total with nothing to judge it
 * against.
 *
 * So it opens with an answer. One question anybody can answer without thinking
 * — how many people — three shapes to recognise yourself in, and the price
 * PER PERSON, because that number is both small and directly comparable to what
 * a competitor charges. €22 a head reads as reasonable; €133.94 reads as
 * expensive. They are the same bill.
 *
 * Everything else is folded behind "See exactly what's included". People who
 * want to configure can. Nobody has to.
 */

type PresetKey = 'basics' | 'field' | 'everything';

/**
 * Three shapes, not three tiers.
 *
 * Nothing is locked to a preset — it fills the toggles in and can be changed
 * immediately after. They exist so somebody can recognise themselves in one
 * line instead of reading sixteen module names.
 */
const PRESETS: Record<PresetKey, { modules: string[]; addOns: string[]; units: Record<string, number> }> = {
  basics: {
    modules: ['subtasks', 'checklists', 'attachments'],
    addOns: [],
    units: {},
  },
  field: {
    modules: ['checklists', 'attachments', 'tracking', 'time_tracking', 'service_reports'],
    addOns: [],
    units: {},
  },
  everything: {
    modules: [
      'subtasks', 'checklists', 'attachments', 'custom_fields',
      'tracking', 'time_tracking', 'service_reports', 'assets', 'crm',
    ],
    addOns: ['invoicing', 'recurring'],
    units: { assets: 40, crm: 120 },
  },
};

/** One bill, from the same functions the invoice is built from. */
const priceFor = (mods: string[], adds: string[], u: Record<string, number>, n: number) =>
  orgMonthlyCost({
    seatCount: n,
    spaces: [{ spaceId: 'a', spaceName: 'a', enabledModules: mods, usage: u }],
    addOns: adds,
  });

export function PricingEstimator() {
  const { t } = useTranslation();

  const [people, setPeople] = useState(6);
  const [preset, setPreset] = useState<PresetKey>('field');
  const [modules, setModules] = useState<string[]>(PRESETS.field.modules);
  const [addOns, setAddOns] = useState<string[]>([]);
  const [units, setUnits] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    setModules(PRESETS[key].modules);
    setAddOns(PRESETS[key].addOns);
    setUnits(PRESETS[key].units);
  };

  const bill = useMemo(() => priceFor(modules, addOns, units, people), [modules, addOns, units, people]);
  const perPerson = Math.round(bill.monthlyCents / Math.max(1, people));

  // Each card carries its OWN price at the current team size, so choosing
  // between them is a comparison rather than three clicks to find out.
  const presetPrices = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(PRESETS) as PresetKey[]).map((k) => {
          const p = PRESETS[k];
          const b = priceFor(p.modules, p.addOns, p.units, people);
          return [k, Math.round(b.monthlyCents / Math.max(1, people))];
        }),
      ) as Record<PresetKey, number>,
    [people],
  );

  const toggleModule = (key: string) =>
    setModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const toggleAddOn = (key: string) =>
    setAddOns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const CARDS: { key: PresetKey; title: string; body: string }[] = [
    {
      key: 'basics',
      title: t('home.estimator.preset.basics.title', 'Just organise the work'),
      body: t('home.estimator.preset.basics.body', 'Jobs, checklists and photos. Replaces the whiteboard and the group chat.'),
    },
    {
      key: 'field',
      title: t('home.estimator.preset.field.title', 'Run a field team'),
      body: t('home.estimator.preset.field.body', 'All of that, plus GPS, clock-in and signed service reports.'),
    },
    {
      key: 'everything',
      title: t('home.estimator.preset.everything.title', 'Run the whole business'),
      body: t('home.estimator.preset.everything.body', 'Add customers, assets, invoicing and repeating jobs.'),
    },
  ];

  return (
    <div>
      {/* ── one question ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label htmlFor="team-size" className="text-[15px] font-medium text-foreground">
          {t('home.estimator.teamSize', 'How many people work with you?')}
        </label>
        <span className={`${DISPLAY} text-[2rem] leading-none text-foreground [font-variant-numeric:tabular-nums]`}>
          {people}
        </span>
      </div>
      <input
        id="team-size"
        type="range"
        min={1}
        max={60}
        value={people}
        onChange={(e) => setPeople(Number(e.target.value))}
        className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-[#5B9BD5]"
      />

      {/* ── three shapes, each with its own price ───────────────────────── */}
      <div className="mt-9 grid gap-3 sm:grid-cols-3">
        {CARDS.map((c) => {
          const on = preset === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => applyPreset(c.key)}
              className={`rounded-2xl border p-5 text-left transition-colors ${
                on ? 'border-[#5B9BD5] bg-[#5B9BD5]/[0.07]' : 'border-foreground/[0.12] hover:border-foreground/30'
              }`}
            >
              <p className="text-[15px] font-medium text-foreground">{c.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/45">{c.body}</p>
              <p
                className={`${MONO} mt-4 text-[13px] [font-variant-numeric:tabular-nums]`}
                style={on ? { color: ACCENT } : undefined}
              >
                {formatCents(presetPrices[c.key])}
                <span className="text-foreground/40"> {t('home.estimator.perPerson', '/ person / month')}</span>
              </p>
            </button>
          );
        })}
      </div>

      {/* ── the answer ──────────────────────────────────────────────────── */}
      <div className="mt-9 rounded-2xl border border-foreground/[0.12] p-7 sm:p-9">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className={`${DISPLAY} text-[clamp(2.6rem,8vw,4rem)] font-normal leading-none tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]`}>
              {formatCents(perPerson)}
            </p>
            <p className={`${MONO} mt-2 text-[12px] text-foreground/45`}>
              {t('home.estimator.perPersonLong', 'per person, per month')}
            </p>
          </div>
          <div className="text-right">
            <p className={`${MONO} text-[13px] text-foreground/60 [font-variant-numeric:tabular-nums]`}>
              {t('home.estimator.totalFor', '{{price}} in total', { price: formatCents(bill.monthlyCents) })}
            </p>
            <p className={`${MONO} mt-1 text-[12px] text-foreground/35 [font-variant-numeric:tabular-nums]`}>
              {t('home.estimator.orAnnual', 'or {{price}} a year — 2 months free', {
                price: formatCents(bill.annualCents),
              })}
            </p>
          </div>
        </div>

        {/* The number that makes the number reasonable. */}
        <p className="mt-6 border-t border-foreground/[0.08] pt-5 text-[13.5px] leading-relaxed text-foreground/50">
          {t('home.estimator.anchor', 'The separate tools this replaces cost €60–90 per person.')}
        </p>
      </div>

      {/* ── everything else, folded away ────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${MONO} mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-foreground/45 transition-colors hover:text-foreground`}
      >
        {open ? t('home.estimator.hide', 'Hide the detail') : t('home.estimator.show', "See exactly what's included")}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-6 space-y-7 rounded-2xl border border-foreground/[0.08] p-6">
          <Group
            title={t('home.estimator.modules', 'In this space')}
            items={AVAILABLE_MODULES.filter((m) => (MODULE_MONTHLY_CENTS[m.key as string] ?? 0) > 0).map((m) => ({
              key: m.key as string,
              label: t(`modules.${m.key}.label`, m.label),
              cents: MODULE_MONTHLY_CENTS[m.key as string] ?? 0,
              suffix: billsByUsage(m.key as string) ? '+' : undefined,
            }))}
            selected={modules}
            onToggle={toggleModule}
          />
          <Group
            title={t('home.estimator.addOns', 'For the whole company')}
            items={AVAILABLE_ADD_ONS.map((a) => ({
              key: a.key,
              label: t(`addOns.${a.key}.label`, a.label),
              cents: a.monthlyCents,
            }))}
            selected={addOns}
            onToggle={toggleAddOn}
          />
          <p className="text-[12.5px] leading-relaxed text-foreground/40">
            {t(
              'home.estimator.detailNote',
              'A “+” means the price also grows with how many you have — and gets cheaper per item as it does. Switch anything off and it stops being charged that day.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { key: string; label: string; cents: number; suffix?: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <p className={`${MONO} mb-3 text-[10px] uppercase tracking-[0.18em] text-foreground/35`}>{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.includes(it.key);
          return (
            <button
              key={it.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(it.key)}
              className={`${MONO} rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                on
                  ? 'border-transparent text-[#04121f]'
                  : 'border-foreground/15 text-foreground/55 hover:border-foreground/40 hover:text-foreground'
              }`}
              style={on ? { backgroundColor: ACCENT } : undefined}
            >
              {it.label}
              <span className={on ? 'opacity-70' : 'opacity-45'}>
                {' '}
                {formatCents(it.cents)}
                {it.suffix}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
