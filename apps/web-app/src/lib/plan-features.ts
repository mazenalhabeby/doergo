import { modulesForTier, PLANS, type PlanTier } from '@hbcfield/shared/client';

/** Human-readable labels for the raw feature-module keys (falls back to Title Case). */
export const MODULE_LABELS: Record<string, string> = {
  subtasks: 'Subtasks',
  checklists: 'Checklists',
  attachments: 'File attachments',
  tracking: 'Exact-route GPS',
  time_tracking: 'Geofenced clock-in',
  service_reports: 'Service reports & assets',
  recurring: 'Recurring jobs',
  custom_fields: 'Custom fields',
  overtime: 'Overtime engine',
  invoicing: 'Invoicing',
  multi_org: 'Multi-org delegation',
  audit_log: 'Audit log',
  workflows: 'Workflows',
  sprints: 'Sprints',
  epics: 'Epics',
  phases: 'Phases',
};

export const planFeatureLabel = (m: string): string =>
  MODULE_LABELS[m] ?? m.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

type SelfServeTier = Exclude<PlanTier, 'enterprise'>;
const PREV: Record<SelfServeTier, SelfServeTier | null> = {
  starter: null,
  professional: 'starter',
  business: 'professional',
};

/**
 * The features a tier ADDS over the tier below it, so plan cards can read
 * "Everything in <prevName>, plus: …" instead of repeating the shared base
 * (which made Professional and Business look identical).
 */
export function tierDelta(tier: SelfServeTier): { prevName: string | null; features: string[] } {
  const prev = PREV[tier];
  const features = prev
    ? modulesForTier(tier).filter((m) => !modulesForTier(prev).includes(m))
    : modulesForTier(tier);
  return { prevName: prev ? PLANS[prev].name : null, features };
}
