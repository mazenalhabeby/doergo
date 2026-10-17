import { captureEvidence } from '../clock';
import type { SyncEngine } from '../sync-engine';
import { outcomeOf, type ActionOutcome } from '../actions/outcome';

/**
 * A crew on one job (shared tasks/crew.ts), through the outbox: each carries
 * the tap's own time and evidence, so "I'm with him" in a basement counts
 * from when it was tapped, and a replay never writes twice (the op id is the
 * Idempotency-Key). In the job's lane, so it lands in order with its steps.
 */
type CrewOp = 'task.join' | 'task.leave' | 'task.selfIssue' | 'task.selfResume';

function crewOp(engine: SyncEngine, op: CrewOp, taskId: string, body: Record<string, unknown> = {}): Promise<ActionOutcome> {
  return engine
    .enqueueAndSettle({
      op,
      lane: `task:${taskId}`,
      entityId: taskId,
      payload: { params: { taskId }, body: { ...body, evidence: captureEvidence(null) } },
    })
    .then((settled) => outcomeOf(engine, settled));
}

export const joinCrew = (engine: SyncEngine, taskId: string, viaLeaderStart = false) =>
  crewOp(engine, 'task.join', taskId, viaLeaderStart ? { viaLeaderStart: true } : {});
export const leaveCrew = (engine: SyncEngine, taskId: string) => crewOp(engine, 'task.leave', taskId);
export const reportMyIssue = (engine: SyncEngine, taskId: string, reason: string) => crewOp(engine, 'task.selfIssue', taskId, { reason });
export const resumeMine = (engine: SyncEngine, taskId: string) => crewOp(engine, 'task.selfResume', taskId);

/** Handing the lead over is a decision, not a tap in the field: no evidence, still queued. */
export function changeLead(
  engine: SyncEngine,
  taskId: string,
  body: { toUserId: string; scope: 'TODAY' | 'PERMANENT'; reason?: string },
): Promise<ActionOutcome> {
  return engine
    .enqueueAndSettle({ op: 'task.lead', lane: `task:${taskId}`, entityId: taskId, payload: { params: { taskId }, body } })
    .then((settled) => outcomeOf(engine, settled));
}
