import { Prisma } from '@prisma/client';
import { OPEN_EXCURSION_STATUSES, type RestRow } from '../core/open-shift-close';
import { type ClockOutHandover } from '../../tasks/handover/job-pause.service';
import {
  TimeEntryStatus,
  judgedByLabelRules,
  readLabelFacts,
  withClosing,
  type ClosedHow,
  type PositionFact,
} from '@hbcfield/shared';

/**
 * What every close reads in the SAME query as the entry: all its rests (the
 * totals are recomputed from the rows) and the excursions still open on it.
 * One include, so a sweep closing a hundred shifts asks once, not per row.
 */
export const CLOSE_ENTRY_INCLUDE = {
  breaks: { select: { id: true, startedAt: true, endedAt: true, durationMinutes: true, isPaid: true } },
  geofenceExcursions: {
    where: { status: { in: [...OPEN_EXCURSION_STATUSES] } },
    orderBy: { leftRingAt: 'asc' },
    select: { id: true, leftRingAt: true },
  },
} satisfies Prisma.TimeEntryInclude;

/** The entry as a close needs it — any caller's row with CLOSE_ENTRY_INCLUDE. */
interface ClosableEntry {
  id: string;
  userId: string;
  organizationId: string;
  /** The workspace — asked only when an automatic rest may be owed. */
  locationId?: string;
  clockInAt: Date;
  /** "Still working" on the automatic rest: none is inserted at the close. */
  autoRestSkippedAt?: Date | null;
  expectedClockInAt?: Date | null;
  expectedClockOutAt?: Date | null;
  shiftId?: string | null;
  breakMinutes?: number | null;
  unpaidBreakMinutes?: number | null;
  breaks?: RestRow[];
  geofenceExcursions?: { id: string }[];
  /** The rests planned at clock-in — a required one still not taken at the close is missed. */
  breakPlan?: Prisma.JsonValue | null;
  flagReasons?: string[] | null;
  /** Label rules version; null = an old entry, closed exactly as before. */
  labelRules?: number | null;
  labelFacts?: Prisma.JsonValue | null;
  /** Changed by hand while running: past an office rule it waits for approval at the close (hand-edit-review). */
  isEdited?: boolean | null;
  originalClockIn?: Date | null;
  originalClockOut?: Date | null;
}

/** How a shift is being closed. Everything the close itself works out is NOT here. */
interface CloseSpec {
  /** The clock-out instant recorded on the entry. */
  at: Date;
  /** What the claim requires: an open shift, or one the sweep closed temporarily. */
  from: 'OPEN' | 'PROVISIONAL';
  /** CLOCKED_OUT, or AUTO_OUT for a close the system made on somebody's behalf. */
  status?: TimeEntryStatus.CLOCKED_OUT | TimeEntryStatus.AUTO_OUT;
  /** What only this caller knows: flags, approval, notes, position, provisional basis. */
  fields: Prisma.TimeEntryUpdateManyMutationInput;
  /** Pass it when already looked up (the clock-out needs it for its flags). */
  toleranceMin?: number;
  /** How it closed and where — recorded in the label facts of a new entry (never an old one). */
  labels?: { closedHow: ClosedHow; clockOut?: PositionFact; departureByPhone?: boolean };
  pause: {
    reason: 'CLOCK_OUT' | 'AUTO_CLOSE' | 'FORGOT' | 'OFFICE_CLOSE';
    handovers?: ClockOutHandover[];
    /** Move pauses this shift already made to the close (a real time replacing a guess). */
    sinceClockIn: boolean;
  };
  /** Emit `attendance_clock_out`. The sweep announces its own, different event. */
  announce: boolean;
  /** Read the closed row back (with location + user) for the caller's reply. */
  readBack: boolean;
  now?: Date;
}

const CLOSED_ROW_INCLUDE = {
  location: true,
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TimeEntryInclude;

type ClosedRow = Prisma.TimeEntryGetPayload<{ include: typeof CLOSED_ROW_INCLUDE }>;

/** The label-facts column for a close: only for entries judged by the label rules. */
function closingLabelColumns(
  entry: ClosableEntry,
  labels: CloseSpec['labels'],
): Prisma.TimeEntryUpdateManyMutationInput {
  if (!labels || !judgedByLabelRules(entry)) return {};
  const facts = readLabelFacts(entry.labelFacts);
  if (!facts) return {};
  return { labelFacts: withClosing(facts, labels) as unknown as Prisma.InputJsonValue };
}

export { ClosableEntry, CloseSpec, CLOSED_ROW_INCLUDE, ClosedRow, closingLabelColumns };
