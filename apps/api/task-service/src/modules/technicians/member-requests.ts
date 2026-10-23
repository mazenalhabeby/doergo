import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  REQUEST_KINDS,
  isAbsence,
  requestKindsOffered,
  resolveAwayAccess,
  type RequestKind,
  toISODateString,
  personRemoteFacts,
  activeAssignmentWhere,
  type PrismaService,
} from '@hbcfield/shared';
import type { CalendarRulesService } from '../calendar/calendar-rules.service';

// Leave dates are Postgres DATEs (stored at midnight UTC), so they are read back
// with toISODateString — the UTC day IS the stored day. Through the server's
// local zone they would move a day for anybody west of Greenwich.

/**
 * What a member's request touches: the workspaces they could ask about, what it
 * would collide with, and how many working days it costs. Read by sending, deciding,
 * the office's own entries and the pre-check — one rule each.
 */

/**
 * The workspaces a member could ask a request about, and what each offers.
 *
 * ONE read of their active assignments (with the space's ceiling, its request kinds and the
 * per-assignment override) plus the member — the same facts the clock-in decides "away" from,
 * read through the same `resolveAwayAccess`, so a remote day is only offered where the clock-in
 * would honour it.
 */
export async function requestSpaces(prisma: PrismaService, organizationId: string, userId: string) {
  const [member, assignments] = await Promise.all([
    personRemoteFacts(prisma, userId, organizationId),
    prisma.spaceAssignment.findMany({
      where: { ...activeAssignmentWhere(userId), space: { organizationId, isActive: true, isRemote: false } },
      select: {
        allowRemote: true,
        space: { select: { id: true, name: true, lat: true, lng: true, geofencePolicy: true, requestKinds: true } },
      },
    }),
  ]);
  if (!member) throw new NotFoundException('Employee not found in organization');

  const byId = new Map<string, { id: string; name: string; mayWorkRemotely: boolean; kinds: RequestKind[] }>();
  for (const a of assignments) {
    const s = a.space;
    const spaceHasPin = s.lat != null && s.lng != null;
    // Away means something only where there is a site to be away FROM (the clock-in list's rule).
    const mayHere =
      spaceHasPin &&
      resolveAwayAccess({
        spaceHasPin,
        policy: s.geofencePolicy,
        userAllowRemote: member.allowRemote,
        assignmentAllowRemote: a.allowRemote,
        isAdmin: member.role === 'ADMIN',
      }).allowed;
    const may = mayHere || !!byId.get(s.id)?.mayWorkRemotely;
    byId.set(s.id, {
      id: s.id,
      name: s.name,
      mayWorkRemotely: may,
      kinds: requestKindsOffered({ enabled: s.requestKinds, mayWorkRemotely: may }),
    });
  }
  const spaces = [...byId.values()];
  // A kind tied to no workspace: offered when ANY of their workspaces offers it (none = every kind but REMOTE).
  const kinds: RequestKind[] = spaces.length
    ? REQUEST_KINDS.filter((k) => spaces.some((s) => s.kinds.includes(k)))
    : requestKindsOffered({ enabled: [], mayWorkRemotely: false });
  return { spaces, kinds };
}

/**
 * What a request would collide with — the ONE overlap reader, for sending and
 * for the pre-check before sending. Leave collides only with leave; any other
 * kind with the same kind and with leave.
 */
export function requestClashes(prisma: PrismaService, technicianId: string, kind: string, start: Date, end: Date) {
  const leave = isAbsence(kind);
  return prisma.timeOff.findMany({
    where: {
      technicianId,
      status: { in: ['PENDING', 'APPROVED'] },
      kind: { in: leave ? ['LEAVE'] : [kind as never, 'LEAVE'] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { kind: true, startDate: true, endDate: true, status: true },
    take: 5,
  });
}

/**
 * What a leave range costs this person. Refuses a range with no working day in it — a request for
 * a weekend is a mistake the person should see now, not a zero-day row in the manager's queue.
 * `lenient` (a decision on an existing request) never refuses; it records what the range costs.
 */
export async function workingDaysOf(
  calendarRules: CalendarRulesService,
  organizationId: string,
  userId: string,
  start: Date,
  end: Date,
  lenient = false,
): Promise<number> {
  const count = await calendarRules.countLeaveFor(organizationId, userId, toISODateString(start), toISODateString(end));
  if (!lenient && count.counted === 0) {
    throw new BadRequestException({
      code: 'LEAVE_NO_WORKING_DAYS',
      message: 'Those days are all weekends or holidays — there is nothing to take off.',
    });
  }
  return count.counted;
}
