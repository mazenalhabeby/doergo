import type { BreakType, OccurrenceFix } from '@hbcfield/shared/client';
import { outcomeOf, type ActionOutcome } from '../actions/outcome';
import { captureEvidence } from '../clock';
import { uuidv7 } from '../ids';
import type { SyncEngine } from '../sync-engine';
import { openOpFor } from '../outbox/open-ops';
import { OPEN_STATES, type OutboxOp } from '../outbox/types';

/*
  Every action on a shift goes into ONE lane, `shift:<entryId>`, so a clock-in,
  its rests and its clock-out arrive in the order they were tapped. Each also
  names the step it depends on while that step is still on its way: if the
  clock-in is refused, its rests and clock-out fail with "an earlier step was
  not accepted" instead of arriving at a shift that does not exist.
*/
const laneOf = (entryId: string) => `shift:${entryId}`;

function position(fix: OccurrenceFix | null | undefined) {
  return fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : {};
}

export async function clockInFromPhone(
  engine: SyncEngine,
  input: { locationId?: string; isRemote?: boolean; awayReason?: string; fix: OccurrenceFix },
): Promise<{ entryId: string; outcome: ActionOutcome }> {
  const entryId = uuidv7();
  const op = await engine.enqueueAndSettle({
    op: 'attendance.clockIn',
    lane: laneOf(entryId),
    entityId: entryId,
    /*
      ⚠️ A NEW shift waits for the last one to be closed on the server. They
      are different lanes, so without this a morning's clock-in could reach the
      server before last night's queued clock-out — and be refused as "already
      clocked in", because to the server that shift is still open.
    */
    dependsOn: pendingShiftCloses(engine.operations()),
    payload: {
      body: {
        id: entryId,
        ...(input.isRemote ? { isRemote: true } : { locationId: input.locationId }),
        ...position(input.fix),
        ...(input.awayReason ? { awayReason: input.awayReason } : {}),
        evidence: captureEvidence(input.fix),
      },
    },
  });
  return { entryId, outcome: await outcomeOf(engine, op) };
}

export async function clockOutFromPhone(
  engine: SyncEngine,
  input: { entryId: string; fix?: OccurrenceFix | null; notes?: string; earlyReason?: string; overtimeReason?: string },
): Promise<ActionOutcome> {
  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  const op = await engine.enqueueAndSettle({
    op: 'attendance.clockOut',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: {
      body: {
        entryId: input.entryId,
        ...position(input.fix),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.earlyReason ? { earlyReason: input.earlyReason } : {}),
        ...(input.overtimeReason ? { overtimeReason: input.overtimeReason } : {}),
        evidence: captureEvidence(input.fix),
      },
    },
  });
  return outcomeOf(engine, op);
}

export async function startRestFromPhone(
  engine: SyncEngine,
  input: { entryId: string; type?: BreakType; notes?: string; ruleId?: string },
): Promise<{ breakId: string; outcome: ActionOutcome }> {
  const breakId = uuidv7();
  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  const op = await engine.enqueueAndSettle({
    op: 'attendance.breakStart',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: {
      body: {
        id: breakId,
        entryId: input.entryId,
        ...(input.type ? { type: input.type } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.ruleId ? { ruleId: input.ruleId } : {}),
        evidence: captureEvidence(),
      },
    },
  });
  return { breakId, outcome: await outcomeOf(engine, op) };
}

export async function endRestFromPhone(
  engine: SyncEngine,
  input: { entryId: string; breakId: string; notes?: string },
): Promise<ActionOutcome> {
  const start = openOpFor(engine.operations(), 'attendance.breakStart', (b) => b.id === input.breakId);
  const op = await engine.enqueueAndSettle({
    op: 'attendance.breakEnd',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: start ? [start.id] : [],
    payload: {
      body: {
        breakId: input.breakId,
        ...(input.notes ? { notes: input.notes } : {}),
        evidence: captureEvidence(),
      },
    },
  });
  return outcomeOf(engine, op);
}

/**
 * "I'm working extra time", with or without signal.
 *
 * On the shift's own lane, so it always arrives BEFORE that shift's clock-out:
 * asked at 17:05 and clocked out at 18:40 in a basement, the office sees the
 * request on an open shift, and a leader can still approve it after the
 * clock-out arrives (the server allows deciding a closed shift's round).
 */
export async function requestExtraTimeFromPhone(engine: SyncEngine, input: { entryId: string }): Promise<ActionOutcome> {
  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  const op = await engine.enqueueAndSettle({
    op: 'attendance.extraTime',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: { params: { entryId: input.entryId }, body: { occurredAt: new Date().toISOString() } },
  });
  return outcomeOf(engine, op);
}

/** Queued operations that close a shift — what a new clock-in must wait for. */
export function pendingShiftCloses(ops: readonly OutboxOp[]): string[] {
  return ops
    .filter((o) => (o.op === 'attendance.clockOut' || o.op === 'attendance.resolveClockOut') && OPEN_STATES.has(o.state))
    .map((o) => o.id);
}

/**
 * "When did you leave?" for a shift left open — or closed by the server with a
 * temporary time — with or without signal.
 *
 * A clock-out for the same shift already on its way is the better answer (it
 * carries the tap's own evidence), so then nothing extra is sent.
 */
export async function resolveClockOutFromPhone(
  engine: SyncEngine,
  input: { entryId: string; clockOutAt: Date },
): Promise<ActionOutcome> {
  const queuedClockOut = openOpFor(engine.operations(), 'attendance.clockOut', (b) => b.entryId === input.entryId);
  if (queuedClockOut) return { kind: 'queued' };
  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  const op = await engine.enqueueAndSettle({
    op: 'attendance.resolveClockOut',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: { params: { entryId: input.entryId }, body: { clockOutAt: input.clockOutAt.toISOString() } },
  });
  return outcomeOf(engine, op);
}
