import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  flagsForReview,
  offlineLeniency,
  timeUnverified,
  TIME_UNVERIFIED_FLAG,
  type OccurrenceEvidence,
} from '@hbcfield/shared';
import { judgeOccurrence } from '../../../common/occurrence.util';

/**
 * Attendance rules for records a phone made offline and sent later.
 * Pure: the services decide what to read; these decide what it means.
 */

/**
 * AUTO or PENDING, from an entry's flags.
 *
 * "Recorded offline" and "phone restarted" say how an entry was made, not that
 * it is wrong, so they alone do not send it for review.
 */
export function approvalFor(flags: readonly string[]): 'AUTO' | 'PENDING' {
  return flagsForReview(flags).length === 0 ? 'AUTO' : 'PENDING';
}

/**
 * When a clock-in or clock-out happened, judged once for both.
 *
 * `judgeOccurrence`, plus the two answers only the clock asks: is the moment vouched for
 * (TIME_UNVERIFIED — a person looks; the time still counts), and was it genuinely recorded
 * offline (`lenient` — the rules a phone could not ask about keep it instead of refusing).
 */
export function judgeClockStep(
  evidence: OccurrenceEvidence | undefined | null,
  previousAt: Date | null | undefined,
  receivedAt: Date = new Date(),
) {
  const judged = judgeOccurrence(evidence, previousAt, receivedAt);
  if (judged.fromEvidence && timeUnverified(judged.flags, judged.at, receivedAt)) {
    judged.flags.push(TIME_UNVERIFIED_FLAG);
  }
  return { ...judged, lenient: judged.fromEvidence && offlineLeniency(judged.at, receivedAt) };
}

export type ClockStepOccurrence = ReturnType<typeof judgeClockStep>;

/**
 * Somebody who is already clocked in tries again.
 *
 * From the phone's queue it is a CONFLICT with the entry that is open — the
 * phone shows "you were already clocked in at …" and the member resolves it.
 * From an online screen it stays the 400 the screens already handle.
 */
export function alreadyClockedIn(
  open: { id: string; locationId: string; clockInAt: Date; location?: { name: string } | null },
  fromPhoneQueue: boolean,
): Error {
  const message = `You are already clocked in${open.location ? ` at ${open.location.name}` : ''}. Please clock out first.`;
  if (!fromPhoneQueue) return new BadRequestException(message);
  return new ConflictException({
    message,
    code: 'ALREADY_CLOCKED_IN',
    params: { current: { id: open.id, locationId: open.locationId, clockInAt: open.clockInAt } },
  });
}

/** The same clock-in (or break) sent again: the record the first send made, or a refusal. */
export function sameRecordOrRefuse<T extends { userId: string }>(row: T, userId: string): T {
  if (row.userId !== userId) throw new ConflictException({ message: 'This id is already in use', code: 'ID_IN_USE' });
  return row;
}

/** Within this, two clock-out times are the same tap sent twice. */
export const SAME_TAP_MS = 1_000;
