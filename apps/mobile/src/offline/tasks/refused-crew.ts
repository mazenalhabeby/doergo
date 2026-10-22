import { refusalText } from '@/lib/distance';
import type { OutboxOp } from '../outbox/types';

/**
 * A crew action (join, leave, my issue, back to work, the lead) the phone
 * queued and the server refused afterwards — the same gap refused-shift.ts
 * closes for clock-ins: shown at the tap, a refusal is discarded from the
 * outbox (`outcomeOf`), so whatever is still failed/conflict here is one the
 * member never heard about.
 */
export const CREW_OPS: ReadonlySet<string> = new Set(['task.join', 'task.leave', 'task.selfIssue', 'task.selfResume', 'task.lead']);

export function refusedCrewOps(ops: readonly OutboxOp[], taskId?: string): OutboxOp[] {
  return ops
    .filter((o) => CREW_OPS.has(o.op) && (o.state === 'failed' || o.state === 'conflict') && (!taskId || o.entityId === taskId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** What to say: which action, and the server's reason in the member's language. */
export function refusedCrewCopy(t: Translate, op: OutboxOp): { title: string; reason: string } {
  const what = op.op.replace('task.', '');
  return {
    title: t(`job.crew.refused.${what}`, { defaultValue: "This wasn't saved" }),
    reason: refusalText(t, op.lastError ?? {}, t('offline.errors.default')),
  };
}
