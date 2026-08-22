'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, ChevronDown, Check } from 'lucide-react';
import {
  AVAILABLE_ADD_ONS,
  MODULE_MONTHLY_CENTS,
  SEAT_MONTHLY_CENTS,
  ANNUAL_MONTHS_CHARGED,
  orgMonthlyCost,
  formatCents,
  billsByUsage,
  includedUnits,
  usagePriceFor,
  nextUsageBreak,
} from '@hbcfield/shared/client';
import { CAPABILITY_GROUPS, groupMonthlyCents } from '@/lib/capability-groups';

const DISPLAY = 'font-[family:var(--font-familjen)]';
const MONO = 'font-[family:var(--font-martian)]';
const ACCENT = '#5B9BD5';

/**
 * The whole bill, built by the visitor, itemised to the cent.
 *
 * Everything here comes from `orgMonthlyCost` — the same function the invoice is
 * built from. A pricing page with its own arithmetic is a pricing page that
 * eventually lies, and this one has already been caught doing it once.
 *
 * The shape follows how somebody actually thinks about it: people first (the
 * only question with no wrong answer), then each site and what it does, then the
 * few things bought once for the company. A site starts with a sensible set
 * switched on rather than empty, because an empty configurator shows €0 and
 * teaches nothing.
 */

type Site = { id: string; modules: string[]; units: Record<string, number> };

/** What a new site starts with — a field team's set, the common case. */
const STARTER_MODULES = ['checklists', 'attachments', 'tracking', 'time_tracking', 'service_reports'];

let nextId = 2;

export function Calculator() {
  const { t } = useTranslation();

  const [people, setPeople] = useState(6);
  const [annual, setAnnual] = useState(false);
  const [sites, setSites] = useState<Site[]>([{ id: '1', modules: [...STARTER_MODULES], units: {} }]);
  const [addOns, setAddOns] = useState<string[]>([]);
  const [openBill, setOpenBill] = useState(true);

  const bill = useMemo(
    () =>
      orgMonthlyCost({
        seatCount: people,
        spaces: sites.map((s, i) => ({
          spaceId: s.id,
          spaceName: t('pricing.calc.siteN', 'Site {{n}}', { n: i + 1 }),
          enabledModules: s.modules,
          usage: s.units,
        })),
        addOns,
      }),
    [people, sites, addOns, t],
  );

  const perPerson = Math.round(bill.monthlyCents / Math.max(1, people));
  const shown = annual ? bill.annualCents : bill.monthlyCents;

  const setSite = (id: string, fn: (s: Site) => Site) =>
    setSites((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));

  const toggleModule = (id: string, key: string) =>
    setSite(id, (s) => {
      const on = s.modules.includes(key);
      const modules = on ? s.modules.filter((k) => k !== key) : [...s.modules, key];
      // Drop a count with its module: a number left behind for something
      // switched off is invisible here and would be a surprise on an invoice.
      const units = { ...s.units };
      if (on) delete units[key];
      return { ...s, modules, units };
    });

  const toggleGroup = (id: string, keys: string[]) =>
    setSite(id, (s) => {
      const allOn = keys.every((k) => s.modules.includes(k));
      const modules = allOn ? s.modules.filter((k) => !keys.includes(k)) : [...new Set([...s.modules, ...keys])];
      const units = { ...s.units };
      if (allOn) keys.forEach((k) => delete units[k]);
      return { ...s, modules, units };
    });

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
          {/* monthly / annual */}
          <div className="flex rounded-full border border-foreground/[0.12] p-1">
            {([false, true] as const).map((a) => (
              <button
                key={String(a)}
                type="button"
                aria-pressed={annual === a}
                onClick={() => setAnnual(a)}
                className={`${MONO} flex-1 rounded-full py-1.5 text-[10.5px] uppercase tracking-[0.14em] transition-colors ${
                  annual === a ? 'text-[#04121f]' : 'text-foreground/50 hover:text-foreground'
                }`}
                style={annual === a ? { backgroundColor: ACCENT } : undefined}
              >
                {a ? t('pricing.calc.annual', 'Yearly') : t('pricing.calc.monthly', 'Monthly')}
              </button>
            ))}
          </div>

          <p className={`${DISPLAY} mt-7 text-[clamp(2.4rem,7vw,3.4rem)] font-normal leading-none tracking-[-0.02em] text-foreground [font-variant-numeric:tabular-nums]`}>
            {formatCents(shown)}
          </p>
          <p className={`${MONO} mt-2 text-[11.5px] text-foreground/45`}>
            {annual
              ? t('pricing.calc.aYear', 'a year — {{months}} months, not 12', { months: ANNUAL_MONTHS_CHARGED })
              : t('pricing.calc.aMonth', 'a month')}
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

/* ── pieces ──────────────────────────────────────────────────────────────── */

function Panel({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
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

function Line({ label, cents, strong, dim }: { label: string; cents: number; strong?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? 'text-foreground' : dim ? 'text-foreground/45' : 'text-foreground/70'}>{label}</span>
      <span className={strong ? 'text-foreground' : 'text-foreground/45'}>{formatCents(cents)}</span>
    </div>
  );
}

function Chip({
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

function SiteCard({
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
            className="inline-flex size-7 items-center justify-center rounded-full text-foreground/35 transition-colors hover:bg-foreground/10 hover:text-foreground"
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
            <div key={g.key} className={`rounded-lg border transition-colors ${on || partial ? 'border-[#5B9BD5]/40 bg-[#5B9BD5]/[0.05]' : 'border-foreground/[0.09]'}`}>
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

function CountRow({ moduleKey, value, onChange }: { moduleKey: string; value: number; onChange: (n: number) => void }) {
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
