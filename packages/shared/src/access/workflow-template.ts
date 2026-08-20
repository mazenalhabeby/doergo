/**
 * The task-type library: turning a stored template into statuses safely.
 *
 * A library template is the one piece of workflow data that does NOT belong to
 * the organization using it. It is curated by the platform, stored as JSON, and
 * copied into a tenant when someone picks it. Two consequences follow, and this
 * module exists for both.
 *
 * First, the definition is UNTRUSTED at the point of use. It was written by a
 * different party than the one reading it, possibly under an older shape, and
 * JSON has no schema. Everything that becomes a `WorkflowStatus` passes through
 * `normalizeTemplateStatuses` — which coerces types, bounds sizes, and drops
 * what it does not recognise — before it reaches the database.
 *
 * Second, the copy is a COPY. A tenant that adds "Field Service" gets its own
 * statuses, and the library row is never referenced again. Referencing it live
 * would mean a platform edit rewriting the state machine under every tenant's
 * in-flight tasks; a task whose current status stopped existing has no
 * transition out of it, and no code can repair that after the fact.
 *
 * Pure and dependency-free, so the curator's editor, the platform API and the
 * tenant clone all judge a template identically.
 */

import { isStepCapability, isTypeCapability } from './workflow-modules';
import { workflowStatusKey } from './workflow-status-label';

/**
 * Bounds on what a template may contain.
 *
 * Not tuning — a definition is JSON, and JSON with no ceiling is a way to make
 * one row cost a tenant thousands of writes.
 */
export const TEMPLATE_LIMITS = {
  maxStatuses: 40,
  maxTransitionsPerStatus: 40,
  maxNameLength: 60,
  maxKeyLength: 40,
  maxDescriptionLength: 280,
} as const;

/** A status as it is stored in a template — the shape a clone writes out. */
export interface TemplateStatusShape {
  name: string;
  /**
   * Where this name is published for translation.
   *
   * Derived from the key rather than stored, so a shipped template cannot ship
   * a name and a key that disagree. See `workflow-status-label`.
   */
  nameKey: string;
  key: string;
  color: string;
  icon?: string;
  position: number;
  isFinal: boolean;
  isCanceled: boolean;
  transitions: string[];
  capabilities: string[];
}

const DEFAULT_COLOR = '#3b82f6';
const HEX = /^#[0-9a-fA-F]{6}$/;
const KEY_ALLOWED = /[^A-Z0-9_]/g;
/** Icon names are looked up in an icon set, so keep them to that alphabet. */
const ICON_ALLOWED = /^[a-z0-9-]{1,32}$/;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * A status key is an identifier, not prose: it is compared against a task's
 * stored status and against other statuses' transitions, so it has to survive
 * that round trip unchanged. Uppercased and stripped to `A–Z 0–9 _`.
 */
export function normalizeStatusKey(value: unknown): string {
  return str(value, TEMPLATE_LIMITS.maxKeyLength)
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(KEY_ALLOWED, '')
    // Trimmed at the ends so "DONE" and "DONE_" cannot be two different steps.
    .replace(/^_+|_+$/g, '');
}

/** Only capabilities the platform knows how to honour survive. */
function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const cap = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    // STEP capabilities only. A task-type one ("this task has a sprint") cannot
    // be honoured at a moment in the flow, and an unknown one would require a
    // module nothing maps to — never satisfiable, so a workflow carrying it
    // could never be attached anywhere.
    if (cap && isStepCapability(cap) && !out.includes(cap)) out.push(cap);
  }
  return out;
}

/**
 * Coerce a stored definition into statuses that are safe to write.
 *
 * Lenient about shape and strict about content: anything unrecognised is
 * dropped rather than rejected, so one stale field in an old template does not
 * make it unusable — but nothing unrecognised reaches the database either.
 * Whether the RESULT is a usable workflow is a separate question, answered by
 * `validateWorkflow`, because "malformed" and "unfinished" are different faults
 * and deserve different messages.
 */
export function normalizeTemplateStatuses(raw: unknown): TemplateStatusShape[] {
  if (!Array.isArray(raw)) return [];

  const out: TemplateStatusShape[] = [];
  const seen = new Set<string>();

  for (const entry of raw.slice(0, TEMPLATE_LIMITS.maxStatuses)) {
    if (!entry || typeof entry !== 'object') continue;
    const s = entry as Record<string, unknown>;

    const key = normalizeStatusKey(s.key);
    // No key, no status: it could not be transitioned to, stored on a task, or
    // told apart from its neighbours.
    if (!key) continue;
    // A duplicate key makes "which step is this?" unanswerable. The first wins.
    if (seen.has(key)) continue;
    seen.add(key);

    const icon = str(s.icon, 32).toLowerCase();

    out.push({
      key,
      nameKey: workflowStatusKey(key),
      name: str(s.name, TEMPLATE_LIMITS.maxNameLength) || key,
      color: typeof s.color === 'string' && HEX.test(s.color.trim()) ? s.color.trim() : DEFAULT_COLOR,
      ...(ICON_ALLOWED.test(icon) ? { icon } : {}),
      position: Number.isFinite(s.position) ? Number(s.position) : out.length,
      isFinal: s.isFinal === true,
      isCanceled: s.isCanceled === true,
      transitions: Array.isArray(s.transitions)
        ? [...new Set(s.transitions.map(normalizeStatusKey).filter(Boolean))].slice(
            0,
            TEMPLATE_LIMITS.maxTransitionsPerStatus,
          )
        : [],
      capabilities: normalizeCapabilities(s.capabilities),
    });
  }

  // Positions are renumbered from the order given. A template that arrives with
  // duplicate or sparse positions would otherwise decide its own entry step by
  // accident — and the entry step is where every task starts.
  return out
    .sort((a, b) => a.position - b.position)
    .map((s, i) => ({ ...s, position: i }));
}

/** The task-type capabilities on a stored template, cleaned the same way. */
export function normalizeTypeCapabilities(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const cap = typeof entry === 'string' ? entry.trim().toLowerCase() : '';
    if (cap && isTypeCapability(cap) && !out.includes(cap)) out.push(cap);
  }
  return out;
}
