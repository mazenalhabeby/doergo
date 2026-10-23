import type { ClientProxy } from '@nestjs/microservices';
import { OVERTIME_NOTICE_EVENT, type OvertimeNotice, type PrismaService } from '@hbcfield/shared';
import { refusalNudge } from '../attendance/extra-time/extra-time-helpers';

/** How long the person who signed on a technician's phone has to confirm it from their own. */
const SIGNED_CONFIRM_WINDOW_MINUTES = 30;

/**
 * Every push this flow sends, as a catalogue reference (shared
 * attendance/overtime-notice.ts). Never a sentence: the notification service
 * writes it in each reader's language. Nobody to tell → nothing emitted.
 */
function notifyOvertime(
  notificationClient: ClientProxy,
  notice: Omit<OvertimeNotice, 'recipientIds'> & { recipientIds: string[] },
): void {
  if (notice.recipientIds.length === 0) return;
  notificationClient.emit(OVERTIME_NOTICE_EVENT, notice satisfies OvertimeNotice);
}

/**
 * More time refused (a leader's no, or nobody confirming in time): the member stays
 * clocked in and is nudged to clock out now — what counts already stops at the
 * planned end. Never a clock-out (decided 2026-10-18).
 */
async function afterOvertimeRefusal(prisma: PrismaService, timeEntryId: string, now: Date = new Date()): Promise<void> {
  await prisma.timeEntry.updateMany(refusalNudge(timeEntryId, now));
}

export { SIGNED_CONFIRM_WINDOW_MINUTES, notifyOvertime, afterOvertimeRefusal };
