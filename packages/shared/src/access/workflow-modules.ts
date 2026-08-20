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

/**
 * Capabilities come in two kinds, and conflating them produces nonsense.
 *
 * A STEP capability answers "at this step, the member does X" — it belongs to a
 * moment in the flow. Recording a route matters while someone is on the way and
 * stops when they arrive.
 *
 * A TYPE capability is true of the task from the moment it is created to the
 * moment it closes. A task belongs to a sprint; it is not "in a sprint at step
 * three". Putting these on a status would let someone declare something that
 * cannot be honoured at a point in time.
 *
 * Both map into the same table, so there is still ONE answer to "which module
 * does this need" and the refusal, the warning and the advice cannot drift.
 */

/** On a status: what the member does at that step. */
export const STEP_CAPABILITY_MODULE: Record<string, string> = {
  gps: 'tracking',
  timer: 'time_tracking',
  checklist: 'checklists',
  photos: 'attachments',
  report: 'service_reports',
  signature: 'service_reports',
  form: 'custom_fields',
};

/** On the task type: what the task carries throughout its life. */
export const TYPE_CAPABILITY_MODULE: Record<string, string> = {
  subtasks: 'subtasks',
  dependencies: 'dependencies',
  sprint: 'sprints',
  story_points: 'story_points',
  epic: 'epics',
  phase: 'phases',
  crm: 'crm',
};

/** Every capability, whichever level it belongs to → the module it needs. */
export const CAPABILITY_MODULE: Record<string, string> = {
  ...STEP_CAPABILITY_MODULE,
  ...TYPE_CAPABILITY_MODULE,
};

/** Is this a step capability? Statuses accept nothing else. */
export function isStepCapability(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(STEP_CAPABILITY_MODULE, key);
}

/** Is this a task-type capability? The type accepts nothing else. */
export function isTypeCapability(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(TYPE_CAPABILITY_MODULE, key);
}

export interface WorkflowStatusCapabilities {
  /** Display name, so a refusal can say WHICH step needs the module. */
  name?: string;
  capabilities?: string[] | null;
}

/**
 * Every module a task type requires — from its steps AND from the type itself,
 * de-duplicated and sorted.
 *
 * The second argument is what makes a Project task type able to say it needs
 * Sprints. Before it existed, twelve of the eighteen modules could not be
 * declared by a workflow at all, so nothing could warn about them.
 */
export function modulesRequiredByWorkflow(
  statuses: WorkflowStatusCapabilities[] | null | undefined,
  typeCapabilities?: string[] | null,
): string[] {
  const out = new Set<string>();
  for (const s of statuses ?? []) {
    for (const cap of s?.capabilities ?? []) {
      const mod = STEP_CAPABILITY_MODULE[cap];
      if (mod) out.add(mod);
    }
  }
  for (const cap of typeCapabilities ?? []) {
    const mod = TYPE_CAPABILITY_MODULE[cap];
    if (mod) out.add(mod);
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
  typeCapabilities?: string[] | null,
): string[] {
  const enabled = new Set(enabledModules ?? []);
  return modulesRequiredByWorkflow(statuses, typeCapabilities).filter((m) => !enabled.has(m));
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
    .filter((s) => (s?.capabilities ?? []).some((c) => STEP_CAPABILITY_MODULE[c] === moduleKey))
    .map((s) => s.name ?? '')
    .filter(Boolean);
}

/**
 * Why a module is needed, in words — the steps that need it, or the task type
 * itself. "not allowed" sends someone hunting; this names what to look at.
 */
export function explainModuleRequirement(
  statuses: WorkflowStatusCapabilities[] | null | undefined,
  typeCapabilities: string[] | null | undefined,
  moduleKey: string,
): string {
  const steps = statusesRequiringModule(statuses, moduleKey);
  if (steps.length > 0) return steps.join(', ');
  const fromType = (typeCapabilities ?? []).some((c) => TYPE_CAPABILITY_MODULE[c] === moduleKey);
  return fromType ? 'this task type' : '';
}
