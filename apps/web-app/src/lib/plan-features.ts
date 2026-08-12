import { entitlementsForTier, PLANS, type PlanTier } from '@hbcfield/shared/client';

/** Human-readable labels for the raw feature keys (falls back to Title Case). */
export const MODULE_LABELS: Record<string, string> = {
  subtasks: 'Subtasks',
  checklists: 'Checklists',
  attachments: 'File attachments',
  tracking: 'Exact-route GPS',
  time_tracking: 'Geofenced clock-in',
  service_reports: 'Service reports & assets',
  custom_fields: 'Custom fields',
  dependencies: 'Task dependencies',
  recurring: 'Recurring jobs',
  overtime: 'Overtime engine',
  shift_scheduling: 'Shift scheduling',
  invoicing: 'Invoicing',
  crm: 'Sales & CRM',
  sprints: 'Sprints',
  story_points: 'Story points',
  epics: 'Epics',
  phases: 'Phases',
  workflows: 'Workflows',
  audit_log: 'Audit log',
  multi_org: 'Multi-org delegation',
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
    ? entitlementsForTier(tier).filter((m) => !entitlementsForTier(prev).includes(m))
    : entitlementsForTier(tier);
  return { prevName: prev ? PLANS[prev].name : null, features };
}
