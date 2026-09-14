import { BadRequestException, ConflictException } from '@nestjs/common';
import { flagsForReview } from '@hbcfield/shared';

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
