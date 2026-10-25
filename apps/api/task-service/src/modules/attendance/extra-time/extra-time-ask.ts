import { personName } from '@hbcfield/shared';
import { emitEvent, attendanceOvertimeRequestEvent } from '@hbcfield/shared/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import { askAboutOwnRequest, type OwnRequestAsk } from '../../approvals/own-request-route';
import type { AttendanceRoutingService } from '../core/attendance-routing.service';

/**
 * Who is asked about one member's extra time: the shared own-request rule (a leader's own → the
 * administrators, the only administrator's own → approved at once) over the workspace's deciders.
 * One answer for the request and for the reminder about it.
 */
export async function askAboutExtraTime(
  prisma: unknown,
  routing: AttendanceRoutingService,
  entry: { locationId: string; organizationId: string; userId: string },
): Promise<OwnRequestAsk> {
  return askAboutOwnRequest(prisma, {
    organizationId: entry.organizationId,
    subjectId: entry.userId,
    kind: 'extraTime',
    spaceIds: entry.locationId ? [entry.locationId] : [],
    usual: await routing.notifyTargetsFor(entry, 'extraTime'),
  });
}

/**
 * A request for more time nobody answered (clock review B10): its deciders are asked ONCE more, then it waits
 * quietly for the decision — the reminder engine is not re-armed for it (the worker is not nudged while asking).
 */
export async function remindUnansweredExtraTime(
  deps: { prisma: any; routing: AttendanceRoutingService; notificationClient: ClientProxy },
  entry: {
    id: string;
    userId: string;
    locationId: string;
    organizationId: string;
    user: { firstName: string; lastName: string } | null;
    location: { name: string } | null;
  },
): Promise<void> {
  const claimed = await deps.prisma.timeEntry.updateMany({
    where: { id: entry.id, reminderState: 'OVERTIME_PENDING', nextRemindAt: { not: null } },
    data: { nextRemindAt: null },
  });
  if (!claimed.count) return;
  const ask = await askAboutExtraTime(deps.prisma, deps.routing, entry);
  if (ask.route === 'AUTOMATIC' || !ask.ids.length) return;
  emitEvent(deps.notificationClient, attendanceOvertimeRequestEvent, {
    entryId: entry.id,
    userId: entry.userId,
    userName: entry.user ? personName(entry.user) : 'A worker',
    locationId: entry.locationId,
    locationName: entry.location?.name || 'a shift',
    leaderIds: ask.ids,
    organizationId: entry.organizationId,
  });
}
