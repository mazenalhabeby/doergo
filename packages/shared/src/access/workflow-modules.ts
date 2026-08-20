/**
 * What a workflow needs the space to have switched on.
 *
 * A workflow's statuses already declare what happens at each step —
 * `WorkflowStatus.capabilities` names gps, timer, signature and the rest. Those
 * capabilities are only meaningful when the space has the corresponding module
 * enabled: a step that asks the member to record a route is decoration in a
 * space where route tracking is off.
 *
 * So the requirement is DERIVED from the workflow rather than declared
 * separately. Nobody has to remember to keep a second list in step, and a
 * workflow that gains a GPS step gains its requirement in the same edit.
 *
 * Pure and dependency-free: the server enforces with it, the interface explains
 * with it, and neither can drift from the other.
 */

/** Capability on a status → the module a space must enable for it to work. */
export const CAPABILITY_MODULE: Record<string, string> = {
  gps: 'tracking',
  timer: 'time_tracking',
  checklist: 'checklists',
  photos: 'attachments',
  report: 'service_reports',
  signature: 'service_reports',
  form: 'custom_fields',
};

export interface WorkflowStatusCapabilities {
  /** Display name, so a refusal can say WHICH step needs the module. */
  name?: string;
  capabilities?: string[] | null;
}

/** Every module a workflow's statuses require, de-duplicated and sorted. */
export function modulesRequiredByWorkflow(
  statuses: WorkflowStatusCapabilities[] | null | undefined,
): string[] {
  const out = new Set<string>();
  for (const s of statuses ?? []) {
    for (const cap of s?.capabilities ?? []) {
      const mod = CAPABILITY_MODULE[cap];
      if (mod) out.add(mod);
    }
  }
  return [...out].sort();
}

/**
 * Which required modules a space is missing — empty means the workflow fits.
 *
 * Returned rather than a boolean so the refusal can name what to switch on. "It
 * needs Route tracking, which is off here" is actionable; "not allowed" is a
 * dead end that sends someone hunting.
 */
export function missingModulesForWorkflow(
  statuses: WorkflowStatusCapabilities[] | null | undefined,
  enabledModules: string[] | null | undefined,
): string[] {
  const enabled = new Set(enabledModules ?? []);
  return modulesRequiredByWorkflow(statuses).filter((m) => !enabled.has(m));
}

/**
 * The steps that need a given module — for an explanation that points at the
 * part of the workflow responsible, instead of the workflow as a whole.
 */
export function statusesRequiringModule(
  statuses: WorkflowStatusCapabilities[] | null | undefined,
  moduleKey: string,
): string[] {
  return (statuses ?? [])
    .filter((s) => (s?.capabilities ?? []).some((c) => CAPABILITY_MODULE[c] === moduleKey))
    .map((s) => s.name ?? '')
    .filter(Boolean);
}
