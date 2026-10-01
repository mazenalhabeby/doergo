import { getStatusCapabilities } from '../types/task-flow';

/**
 * Clocked in to start work — ONE rule for the server, the phone and the web.
 *
 * A job's time used to run with nobody on the clock: an employee could start a
 * job from home, or the office could start it for them, and the hours on the job
 * and the hours on the timesheet then told two different stories. Now every move
 * into a WORKING step needs the person doing the job to be clocked in — at a
 * site or away from one, any open shift counts.
 *
 * ⚠️ "Working step" is read from the step's capabilities, never a list of names:
 * workflows are the organization's own (DOING, PICKED_UP, VISITED…). A step
 * where work time runs carries `timer`. Two such steps are NOT starting work:
 *
 *   ACCEPTED — taking a job on, which happens the evening before, from the sofa;
 *   BLOCKED  — a pause. Reporting an issue must never be refused for want of a
 *              shift: that is exactly when somebody needs to say something.
 *
 * ⚠️ Only where a clock exists. A workspace with Time Tracking off has no clock to
 * be on, and an external member never has one — requiring it there would make
 * every job unstartable, not safer.
 */

/** The refusal codes. The screens translate them; the server never sends a sentence. */
export const CLOCK_GATE_CODES = {
  /** The person moving the job is the one who must be clocked in. */
  SELF: 'NOT_CLOCKED_IN',
  /** The office moved somebody else's job; that person is not clocked in. */
  ASSIGNEE: 'ASSIGNEE_NOT_CLOCKED_IN',
} as const;

const NOT_STARTING_WORK = new Set(['ACCEPTED', 'BLOCKED']);

/**
 * The capabilities active at a step: the workflow's own (admin-editable, and
 * authoritative) when it defines the step, else the shared presets — the same
 * precedence the task detail already applies.
 */
export function stepCapabilities(
  workflow: { name?: string | null; statuses?: Array<{ key: string; capabilities?: string[] | null }> | null } | null | undefined,
  statusKey: string,
): string[] {
  const own = workflow?.statuses?.find((s) => s.key === statusKey);
  if (own) return own.capabilities ?? [];
  return getStatusCapabilities(workflow?.name ?? null, statusKey);
}

/** Does moving INTO this step start (or resume) work? */
export function stepStartsWork(statusKey: string, capabilities: readonly string[]): boolean {
  return capabilities.includes('timer') && !NOT_STARTING_WORK.has(statusKey);
}

/** Does this workspace run a clock at all? Its own module list, else the organization's. */
export function spaceRunsClock(
  spaceModules: readonly string[] | null | undefined,
  organizationModules: readonly string[] | null | undefined,
): boolean {
  return (spaceModules ?? organizationModules ?? []).includes('time_tracking');
}
