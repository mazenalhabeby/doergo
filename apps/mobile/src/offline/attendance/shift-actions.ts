import type { BreakType, OccurrenceFix } from '@hbcfield/shared/client';
import { outcomeOf, type ActionOutcome } from '../actions/outcome';
import { captureEvidence } from '../clock';
import { uuidv7 } from '../ids';
import type { EnqueueInput, SyncEngine } from '../sync-engine';
import { openOpFor } from '../outbox/open-ops';
import { OPEN_STATES, type OutboxOp } from '../outbox/types';
import { sameArrival } from './same-arrival';

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

/**
 * How a clock step was made, for the two the automatic clock also makes
 * (services/auto-clock). `trigger` tells the server it was automatic;
 * `occurredAt` is the moment it HAPPENED — when the member walked in or out —
 * which for an automatic step is earlier than the moment the phone files it;
 * `holdUntil` keeps it on the phone until then (the dwell, the exit grace),
 * still the phone's to take back.
 */
interface StepOrigin {
  trigger?: 'AUTO';
  occurredAt?: Date;
  holdUntil?: number;
}

type ClockInStep = { locationId?: string; isRemote?: boolean; awayReason?: string; fix: OccurrenceFix };
type ClockOutStep = {
  entryId: string;
  fix?: OccurrenceFix | null;
  notes?: string;
  earlyReason?: string;
  overtimeReason?: string;
  handovers?: { taskId: string; note: string }[];
};

/** The one clock-in operation — a tap and the automatic clock file the same thing. */
function clockInRequest(engine: SyncEngine, entryId: string, input: ClockInStep & StepOrigin): EnqueueInput {
  return {
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
    holdUntil: input.holdUntil,
    payload: {
      body: {
        id: entryId,
        ...(input.isRemote ? { isRemote: true } : { locationId: input.locationId }),
        ...position(input.fix),
        ...(input.awayReason ? { awayReason: input.awayReason } : {}),
        ...(input.trigger ? { trigger: input.trigger } : {}),
        evidence: captureEvidence(input.fix, input.occurredAt),
      },
    },
  };
}

/** The one clock-out operation. */
function clockOutRequest(engine: SyncEngine, input: ClockOutStep & StepOrigin): EnqueueInput {
  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  return {
    op: 'attendance.clockOut',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    holdUntil: input.holdUntil,
    payload: {
      body: {
        entryId: input.entryId,
        ...position(input.fix),
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.earlyReason ? { earlyReason: input.earlyReason } : {}),
        ...(input.overtimeReason ? { overtimeReason: input.overtimeReason } : {}),
        // Each note named on the phone, so a replay can never write it twice.
        ...(input.handovers?.length ? { handovers: input.handovers.map((h) => ({ id: uuidv7(), ...h })) } : {}),
        ...(input.trigger ? { trigger: input.trigger } : {}),
        evidence: captureEvidence(input.fix, input.occurredAt),
      },
    },
  };
}

export async function clockInFromPhone(
  engine: SyncEngine,
  input: ClockInStep,
): Promise<{ entryId: string; outcome: ActionOutcome }> {
  // The automatic clock's arrival here is still on the phone: the same arrival, not a second shift.
  const same = input.isRemote ? null : await sameArrival(engine, input.locationId);
  if (same) {
    return { entryId: same.entryId, outcome: same.reachedServer ? { kind: 'done', response: same.response } : { kind: 'queued' } };
  }
  const entryId = uuidv7();
  const op = await engine.enqueueAndSettle(clockInRequest(engine, entryId, input));
  return { entryId, outcome: await outcomeOf(engine, op) };
}

export async function clockOutFromPhone(engine: SyncEngine, input: ClockOutStep): Promise<ActionOutcome> {
  return outcomeOf(engine, await engine.enqueueAndSettle(clockOutRequest(engine, input)));
}

/**
 * The automatic clock's arrival: the same clock-in, marked AUTO, dated when the
 * member walked in, and held on the phone until they have stayed long enough.
 * Not awaited for an answer — nobody is looking at a screen, and a held step
 * has none to give yet.
 */
export async function autoClockInFromPhone(
  engine: SyncEngine,
  input: { locationId: string; fix: OccurrenceFix; at: Date; holdUntil: number },
): Promise<{ entryId: string; opId: string }> {
  const entryId = uuidv7();
  const op = await engine.enqueue(
    clockInRequest(engine, entryId, {
      locationId: input.locationId,
      fix: input.fix,
      trigger: 'AUTO',
      occurredAt: input.at,
      holdUntil: input.holdUntil,
    }),
  );
  return { entryId, opId: op.id };
}

/** The automatic clock's departure: dated when the member LEFT, held until they have stayed out long enough. */
export async function autoClockOutFromPhone(
  engine: SyncEngine,
  input: { entryId: string; fix?: OccurrenceFix | null; at: Date; holdUntil: number },
): Promise<{ opId: string }> {
  const op = await engine.enqueue(
    clockOutRequest(engine, { entryId: input.entryId, fix: input.fix, trigger: 'AUTO', occurredAt: input.at, holdUntil: input.holdUntil }),
  );
  return { opId: op.id };
}

/**
 * "Undo" on an automatic clock-in (a drive-past).
 *
 * Still on the phone — held for its dwell, or never answered — it is simply
 * taken back: the server never hears of a shift that never was. Already sent,
 * the undo is queued on the shift's own lane, so with no signal it still goes,
 * after the clock-in, with the tap's own time for the server to judge the
 * AUTO_CLOCK_UNDO_MINUTES window by.
 */
export async function undoAutoClockInFromPhone(
  engine: SyncEngine,
  input: { entryId: string },
): Promise<ActionOutcome | { kind: 'withdrawn' }> {
  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  if (clockIn && (await engine.cancelPending(clockIn.id))) return { kind: 'withdrawn' };
  const op = await engine.enqueueAndSettle({
    op: 'attendance.autoUndo',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: { params: { entryId: input.entryId }, body: { evidence: captureEvidence() } },
  });
  return outcomeOf(engine, op);
}

/** "Still working" on the planned automatic rest — with or without signal. */
export async function skipAutoRestFromPhone(engine: SyncEngine, input: { entryId: string }): Promise<ActionOutcome> {
  const clockIn = openOpFor(engine.operations(), 'attendance.clockIn', (b) => b.id === input.entryId);
  const op = await engine.enqueueAndSettle({
    op: 'attendance.autoSkipRest',
    lane: laneOf(input.entryId),
    entityId: input.entryId,
    dependsOn: clockIn ? [clockIn.id] : [],
    payload: { params: { entryId: input.entryId }, body: { evidence: captureEvidence() } },
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
