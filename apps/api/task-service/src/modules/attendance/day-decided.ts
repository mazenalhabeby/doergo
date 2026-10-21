import type { ClientProxy } from '@nestjs/microservices';
import { localDateKey } from '@hbcfield/shared';
import { emitEvent, attendanceDayDecidedEvent } from '@hbcfield/shared/microservices';
import type { PrismaService } from '@hbcfield/shared';

/** The entry just decided — enough to find the rest of its day. */
export interface DecidedEntry {
  userId: string;
  organizationId: string;
  clockInAt: Date;
  timezone?: string | null;
}

/** Widest a local day can be from its UTC instant (UTC−12 … UTC+14), plus a margin. */
const DAY_REACH_MS = 40 * 3_600_000;

/**
 * Tell the person their working day is decided — once, when the last entry of
 * that day still waiting leaves review. A day with an entry still waiting, or a
 * shift still running, says nothing yet. One bounded query per decision.
 */
export async function announceDayDecided(
  prisma: PrismaService,
  client: ClientProxy,
  entry: DecidedEntry,
): Promise<void> {
  const zone = entry.timezone ?? null;
  const localDate = localDateKey(entry.clockInAt, zone);
  const around = await prisma.timeEntry.findMany({
    where: {
      userId: entry.userId,
      organizationId: entry.organizationId,
      clockInAt: {
        gte: new Date(entry.clockInAt.getTime() - DAY_REACH_MS),
        lte: new Date(entry.clockInAt.getTime() + DAY_REACH_MS),
      },
    },
    select: { clockInAt: true, timezone: true, status: true, approvalStatus: true, paidMinutes: true },
  });
  const day = around.filter((e) => localDateKey(e.clockInAt, e.timezone ?? zone) === localDate);
  if (!day.length) return;
  if (day.some((e) => e.approvalStatus === 'PENDING' || e.status === 'CLOCKED_IN')) return;
  const kept = day.filter((e) => e.approvalStatus !== 'REJECTED');
  emitEvent(client, attendanceDayDecidedEvent, {
    userId: entry.userId,
    organizationId: entry.organizationId,
    localDate,
    approved: kept.length === day.length,
    countedMinutes: kept.reduce((sum, e) => sum + (e.paidMinutes ?? 0), 0),
  });
}
