'use client';

import { useTranslation } from 'react-i18next';
import {
  AVAILABLE_MODULES,
  MODULE_GROUPS,
  MODULE_MONTHLY_CENTS,
  AVAILABLE_ADD_ONS,
  MODULE_USAGE_PRICING,
  formatCents,
  type AddOnDef,
} from '@hbcfield/shared/client';

const MONO = 'font-[family:var(--font-martian)]';
const ACCENT = '#5B9BD5';

/**
 * Every module, and what it costs.
 *
 * This was a tick-and-cross matrix: four tier columns, and every ✗ meaning
 * "upgrade to unlock". It cannot survive the tiers going away, and the honest
 * replacement is not a smaller matrix — it is the price list itself. Nothing is
 * locked, so the only question left is what a thing costs, and that is a number
 * we already have.
 *
 * Prices come from the same tables the product bills from. The marketing page
 * and a customer's invoice cannot quote different numbers, which is a property
 * the old page could not claim: its columns were maintained by hand.
 */

// Plain-language, benefit-first descriptions written for the marketing page. The
// catalogue's own blurbs are terse in-app labels; these are one clear sentence
// each for a first-time visitor. English here is the i18n FALLBACK — every row
// is looked up at render, so the table translates.
const MARKETING_DESC: Record<string, string> = {
  subtasks: 'Split a big job into smaller steps you can assign and track on their own.',
  checklists: 'A tick-off list on any task, so the same process is followed every time.',
  attachments: 'Photos, PDFs and documents attached straight to the job.',
  dependencies: 'Stop one task starting until another finishes.',
  custom_fields: 'Capture the details your business needs, with your own fields.',
  tracking: 'See where the field team is on a live map, and replay the route driven to each job.',
  service_reports: 'Turn a finished job into a report with photos, parts and a signature.',
  time_tracking: 'Geofenced clock-in, and how long jobs really take against the estimate.',
  assets: 'Track what a site owns — apartments, vehicles, machines — and their history.',
  sprints: 'Plan work in short cycles and see how much gets finished each round.',
  story_points: 'Score tasks by effort to balance workloads and predict a week.',
  epics: 'Group related tasks under one initiative and track it end to end.',
  phases: 'Break a project into stages and watch progress move through them.',
  crm: 'Customer records, history and the sales work against them.',
  b2c_portal: 'Let your customers log in, place orders and follow their jobs.',
  space_sharing: 'Work inside one space together with another company.',
};

/**
 * Modules whose price grows with a count.
 *
 * "COVERS", never "free". The base price is what buys the allowance — Client
 * Portal is €49 and that €49 is one portal, so calling it "first one free"
 * reads as €49 plus a free portal, which is not what anybody is charged. The
 * same word then works for all three rather than being right for assets and
 * wrong here.
 */
const LADDER_NOTE: Record<string, string> = {
  assets: 'covers the first 10, then from €1.20 each',
  crm: 'covers the first 50 clients, then from 30c each',
  b2c_portal: 'covers one portal, then €29 each',
};

function PriceCell({ moduleKey }: { moduleKey: string }) {
  const { t } = useTranslation();
  const cents = MODULE_MONTHLY_CENTS[moduleKey] ?? 0;
  const ladder = MODULE_USAGE_PRICING[moduleKey];
  return (
    <div className="text-right">
      <span className={`${MONO} text-[15px] font-medium text-foreground`}>{formatCents(cents)}</span>
      <span className="text-[12px] text-foreground/35">{t('home.priceList.perSpace', ' / space / mo')}</span>
      {ladder && (
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/40">
          {t(`home.priceList.ladder.${moduleKey}`, LADDER_NOTE[moduleKey] ?? '')}
        </p>
      )}
    </div>
  );
}

export function FeatureMatrix() {
  const { t } = useTranslation();

  const groups = MODULE_GROUPS.map((g) => ({
    key: g.key,
    label: t(`home.compare.groups.${g.key}`, g.label),
    rows: AVAILABLE_MODULES.filter((m) => m.group === g.key && (MODULE_MONTHLY_CENTS[m.key as string] ?? 0) > 0),
  })).filter((g) => g.rows.length > 0);

  const addOnGroups: { key: AddOnDef['group']; label: string }[] = [
    { key: 'work', label: t('home.priceList.addOnGroups.work', 'How work runs') },
    { key: 'money', label: t('home.priceList.addOnGroups.money', 'Money') },
    { key: 'insight', label: t('home.priceList.addOnGroups.insight', 'Insight') },
    { key: 'support', label: t('home.priceList.addOnGroups.support', 'Support') },
  ];

  return (
    <div className="space-y-14">
      {/* ── per-space modules ───────────────────────────────────────────── */}
      <div>
        <p className={`${MONO} mb-1 text-[10px] uppercase tracking-[0.18em] text-foreground/35`}>
          {t('home.priceList.modulesLabel', 'Per space')}
        </p>
        <p className="mb-7 max-w-[46ch] text-[14px] leading-relaxed text-foreground/50">
          {t(
            'home.priceList.modulesLead',
            'Switch a module on for a space and that space pays for it. Switch it off and it stops.',
          )}
        </p>

        <div className="space-y-9">
          {groups.map((g) => (
            <div key={g.key}>
              <p className={`${MONO} mb-3 text-[10px] uppercase tracking-[0.18em]`} style={{ color: ACCENT }}>
                {g.label}
              </p>
              <ul className="divide-y divide-foreground/[0.07] border-y border-foreground/[0.07]">
                {g.rows.map((m) => (
                  <li key={m.key} className="flex items-start justify-between gap-6 py-3.5">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-foreground">
                        {t(`modules.${m.key}.label`, m.label)}
                      </p>
                      <p className="mt-0.5 max-w-[52ch] text-[13px] leading-relaxed text-foreground/45">
                        {t(`home.compare.features.${m.key}.desc`, MARKETING_DESC[m.key as string] ?? m.description)}
                      </p>
                    </div>
                    <PriceCell moduleKey={m.key as string} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── org-wide add-ons ────────────────────────────────────────────── */}
      <div>
        <p className={`${MONO} mb-1 text-[10px] uppercase tracking-[0.18em] text-foreground/35`}>
          {t('home.priceList.addOnsLabel', 'Company-wide')}
        </p>
        <p className="mb-7 max-w-[46ch] text-[14px] leading-relaxed text-foreground/50">
          {t(
            'home.priceList.addOnsLead',
            'Bought once for the whole company, however many spaces you run.',
          )}
        </p>

        <div className="space-y-9">
          {addOnGroups.map((g) => {
            const rows = AVAILABLE_ADD_ONS.filter((a) => a.group === g.key);
            if (!rows.length) return null;
            return (
              <div key={g.key}>
                <p className={`${MONO} mb-3 text-[10px] uppercase tracking-[0.18em]`} style={{ color: ACCENT }}>
                  {g.label}
                </p>
                <ul className="divide-y divide-foreground/[0.07] border-y border-foreground/[0.07]">
                  {rows.map((a) => (
                    <li key={a.key} className="flex items-start justify-between gap-6 py-3.5">
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-foreground">
                          {t(`addOns.${a.key}.label`, a.label)}
                        </p>
                        <p className="mt-0.5 max-w-[52ch] text-[13px] leading-relaxed text-foreground/45">
                          {t(`addOns.${a.key}.description`, a.description)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`${MONO} text-[15px] font-medium text-foreground`}>
                          {formatCents(a.monthlyCents)}
                        </span>
                        <span className="text-[12px] text-foreground/35">
                          {t('home.priceList.perMonth', ' / mo')}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
