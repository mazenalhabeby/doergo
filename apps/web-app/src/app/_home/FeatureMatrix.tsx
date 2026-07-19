'use client';

import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus } from 'lucide-react';
import {
  PLANS,
  PLAN_TIERS,
  tierAllows,
  AVAILABLE_MODULES,
  MODULE_GROUPS,
  type PlanTier,
} from '@hbcfield/shared/client';

const MONO = 'font-[family:var(--font-martian)]';
const ACCENT = '#5B9BD5';
const POPULAR: PlanTier = 'professional';

// Plain-language, benefit-first descriptions written for the marketing page so a
// first-time visitor understands each feature. Kept HERE (not in the shared
// catalog, whose blurbs are terse in-app labels) — one clear sentence per key.
const MARKETING_DESC: Record<string, string> = {
  // Task sections
  subtasks: 'Split a big job into smaller steps you can assign and track on their own, so nothing slips through the cracks.',
  checklists: 'Add a tick-off list of steps to any task so your team follows the same process every time and never misses one.',
  attachments: 'Attach photos, PDFs, and documents straight to a task — everything about the job lives in one place.',
  dependencies: 'Link tasks so one can’t start until another finishes, keeping multi-step jobs in the right order.',
  custom_fields: 'Capture the extra details your business needs — reference numbers, equipment models, anything — with your own fields on every task.',
  // Field service
  tracking: 'See exactly where your field team is on a live map and replay the route they drove to each job.',
  service_reports: 'Turn a finished job into a professional report with photos, parts used, and a customer signature — ready to share or bill.',
  time_tracking: 'Record how long jobs actually take versus the estimate, so you can quote and schedule more accurately.',
  // Agile
  sprints: 'Plan work in short, focused cycles and see at a glance how much your team completes each round.',
  story_points: 'Score each task by effort so you can balance workloads and predict how much fits in a week.',
  epics: 'Bundle many related tasks under one big initiative to track large projects from start to finish.',
  phases: 'Break a project into stages — like planning, execution, and handover — and watch progress move through each.',
  // Premium
  recurring: 'Set a job to repeat daily, weekly, or monthly and the system creates it automatically — no manual re-entry.',
  overtime: 'Let staff request extra hours and managers approve them, with every minute logged for payroll.',
  invoicing: 'Turn completed work into an invoice in a couple of clicks and keep track of what’s been paid.',
  workflows: 'Build your own task stages — the exact steps your business uses — instead of a fixed status list.',
  audit_log: 'Keep a complete record of every action, so you always know who changed what and when.',
  // Support
  priority_routing: 'Your tickets jump the queue ahead of lower plans, so you’re answered sooner when it’s busy.',
  live_chat: 'Chat with a real person in real time, right inside the app, when an agent is online.',
  dedicated_support: 'A named contact and an onboarding call — hands-on help tailored to your team.',
};

// Support entitlements (help center + email + AI-free ticketing are on every plan;
// these are the tier-gated extras — keys live in plans.ts, checked via tierAllows).
const SUPPORT_ROWS: { key: string; label: string }[] = [
  { key: 'priority_routing', label: 'Priority queue routing' },
  { key: 'live_chat', label: 'Live chat' },
  { key: 'dedicated_support', label: 'Dedicated contact & onboarding' },
];

// Premium capabilities are NOT in the module catalog — their keys live in
// plans.ts (gated by tierAllows). Labels here are display-only.
const CAPABILITIES: { key: string; label: string }[] = [
  { key: 'recurring', label: 'Recurring tasks' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'invoicing', label: 'Invoicing' },
  { key: 'workflows', label: 'Custom workflows' },
  { key: 'audit_log', label: 'Audit log' },
];

type Row = { key: string; label: string; description: string };

// Rows grouped exactly like the shared catalog, plus a Premium group. 100%
// code-driven: modules from AVAILABLE_MODULES, ✓/✗ from tierAllows(). English
// label/description here are the i18n FALLBACKS — each is looked up at render via
// t('home.compare.groups.<key>' / '.features.<key>.{label,desc}'), so the whole
// table translates (EN/DE) while staying the single source of truth in English.
const GROUPS: { key: string; label: string; rows: Row[] }[] = [
  ...MODULE_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    rows: AVAILABLE_MODULES.filter((m) => m.group === g.key).map((m) => ({
      key: m.key,
      label: m.label,
      description: MARKETING_DESC[m.key] ?? m.description,
    })),
  })),
  {
    key: 'premium',
    label: 'Premium',
    rows: CAPABILITIES.map((c) => ({ key: c.key, label: c.label, description: MARKETING_DESC[c.key] ?? '' })),
  },
  {
    key: 'support',
    label: 'Support',
    rows: SUPPORT_ROWS.map((r) => ({ key: r.key, label: r.label, description: MARKETING_DESC[r.key] ?? '' })),
  },
];

function Cell({ on }: { on: boolean }) {
  return on ? (
    <span
      className="inline-flex size-[20px] items-center justify-center rounded-full"
      style={{ backgroundColor: `${ACCENT}26` }}
    >
      <Check className="h-3 w-3" strokeWidth={3} style={{ color: ACCENT }} />
    </span>
  ) : (
    <Minus className="mx-auto h-3.5 w-3.5 text-foreground/15" strokeWidth={2.5} />
  );
}

export function FeatureMatrix() {
  const { t } = useTranslation();
  return (
    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[820px] border-collapse text-left">
        {/* Tier header */}
        <thead>
          <tr className="align-bottom">
            <th className="sticky left-0 z-10 bg-background pb-5 pr-4" />
            {PLAN_TIERS.map((tier) => {
              const popular = tier === POPULAR;
              return (
                <th
                  key={tier}
                  className={`w-[15%] px-3 pb-5 pt-3 text-center ${popular ? 'rounded-t-2xl' : ''}`}
                  style={popular ? { backgroundColor: `${ACCENT}0d` } : undefined}
                >
                  {popular && (
                    <span
                      className={`${MONO} mb-2 inline-block rounded-full px-2 py-0.5 text-[8px] uppercase tracking-[0.14em]`}
                      style={{ backgroundColor: ACCENT, color: '#04121f' }}
                    >
                      {t('home.compare.popular', 'Popular')}
                    </span>
                  )}
                  <div className={`${MONO} text-[11px] uppercase tracking-[0.18em] text-foreground/70`}>
                    {PLANS[tier].name}
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-foreground/50">
                    {PLANS[tier].officeMonthlyCents === null
                      ? t('home.compare.custom', 'Custom')
                      : `€${PLANS[tier].officeMonthlyCents / 100}`}
                    {PLANS[tier].officeMonthlyCents !== null && (
                      <span className="text-foreground/30">{t('home.compare.perSeat', '/seat')}</span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {GROUPS.map((group) => (
            <Fragment key={group.key}>
              {/* Category row */}
              <tr>
                <td
                  colSpan={PLAN_TIERS.length + 1}
                  className={`${MONO} sticky left-0 bg-background pb-2 pt-8 text-[10px] uppercase tracking-[0.22em] text-foreground/35`}
                >
                  {t(`home.compare.groups.${group.key}`, group.label)}
                </td>
              </tr>
              {/* Feature rows */}
              {group.rows.map((row) => (
                <tr key={row.key} className="border-t border-foreground/[0.07]">
                  <td className="sticky left-0 z-10 bg-background py-3 pr-4">
                    <div className="text-[13.5px] text-foreground/80">
                      {t(`home.compare.features.${row.key}.label`, row.label)}
                    </div>
                    <div className="mt-1 max-w-[340px] text-[12px] leading-relaxed text-foreground/45">
                      {t(`home.compare.features.${row.key}.desc`, row.description)}
                    </div>
                  </td>
                  {PLAN_TIERS.map((tier) => {
                    const popular = tier === POPULAR;
                    return (
                      <td
                        key={tier}
                        className="px-3 py-3 text-center"
                        style={popular ? { backgroundColor: `${ACCENT}0d` } : undefined}
                      >
                        <Cell on={tierAllows(tier, row.key)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
