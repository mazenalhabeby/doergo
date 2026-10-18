/**
 * Building and reading an entry's LabelFacts. The server writes them in the
 * same statement as the entry; every reader goes through `readLabelFacts`, so a
 * malformed or missing value is “no facts”, never a crash.
 */
import { LABEL_RULES_VERSION, type ClosedHow, type LabelFacts, type PositionFact } from './contract';

/** The columns stamped on a new entry judged by the label rules. */
export function labelColumns(facts: LabelFacts): { labelRules: number; labelFacts: LabelFacts } {
  return { labelRules: LABEL_RULES_VERSION, labelFacts: facts };
}

/** Is this entry judged by the label rules? Old entries (null) keep today's behaviour everywhere. */
export function judgedByLabelRules(entry: { labelRules?: number | null }): boolean {
  return entry.labelRules != null;
}

export function shiftFact(input: {
  shiftId: string | null | undefined;
  shiftName?: string | null;
  expectedClockInAt: Date | null | undefined;
  expectedClockOutAt: Date | null | undefined;
  toleranceMin: number;
  endIsDailyLimit: boolean;
}): LabelFacts['shift'] {
  if (!input.expectedClockInAt) return null;
  return {
    id: input.shiftId ?? null,
    name: input.shiftName ?? null,
    expectedStartAt: input.expectedClockInAt.toISOString(),
    expectedEndAt: input.expectedClockOutAt ? input.expectedClockOutAt.toISOString() : null,
    toleranceMin: input.toleranceMin,
    endIsDailyLimit: input.endIsDailyLimit,
  };
}

/** The facts after a close: how it closed and where. Never drops what the clock-in recorded. */
export function withClosing(
  facts: LabelFacts,
  closing: { closedHow: ClosedHow; clockOut?: PositionFact },
): LabelFacts {
  return { ...facts, closedHow: closing.closedHow, ...(closing.clockOut ? { clockOut: closing.clockOut } : {}) };
}

/** The facts after a planned end moved (approved extra time, agreed hours). */
export function withExpectedEnd(facts: LabelFacts, expectedClockOutAt: Date | null | undefined): LabelFacts {
  if (!facts.shift) return facts;
  return {
    ...facts,
    shift: { ...facts.shift, expectedEndAt: expectedClockOutAt ? expectedClockOutAt.toISOString() : null },
  };
}

/** A stored value as LabelFacts, or null. */
export function readLabelFacts(value: unknown): LabelFacts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Partial<LabelFacts>;
  if (typeof v.firstOfShift !== 'boolean' || !v.clockIn || typeof v.clockIn !== 'object') return null;
  return v as LabelFacts;
}
