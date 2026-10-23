import {
  notEndedWhere,
  ABSENCE_WHERE,
  type PrismaService,
  type CoverLeave,
  type CoverPerson,
  type DateKey,
  toISODateString,
} from '@hbcfield/shared';
import type { CalendarRulesService } from '../calendar/calendar-rules.service';
import { shiftRuleOf } from './cover-helpers';

/*
  What every cover answer reads: the calendar layers, who is rostered when,
  approved leave, and which workspace each person counts in. Read by the
  wallchart's verdicts (CoverService) and the live floor (CoverFloorService).
*/

/**
 * The calendar layer on a roster: each workspace's weekend becomes the rest days of somebody
 * with no rota, and its full holidays are closed days for everybody (a rota shift on one still
 * counts). Three queries for every workspace together.
 */
async function withCalendar(
  calendarRules: CalendarRulesService,
  organizationId: string,
  bySpace: Map<string, CoverPerson[]>,
  from: DateKey,
  to: DateKey,
) {
  const places = await calendarRules.places(organizationId, [...bySpace.keys()], from, to);
  for (const [spaceId, people] of bySpace) {
    const place = places.get(spaceId);
    if (!place) continue;
    const closed = [...place.rules.holidays.values()].filter((h) => !h.halfDay).map((h) => h.day);
    for (const p of people) {
      p.restDows = place.place.weekend;
      p.closedDays = closed;
    }
  }
  return bySpace;
}

/** A Date → the local calendar day the rota means. */
export function coverDayKey(d: Date | string): DateKey {
  return toISODateString(typeof d === 'string' ? new Date(d) : d);
}

/**
 * The roster of every given space, shaped for the rules.
 *
 * ONE query for the people and ONE for their rota, regardless of how many
 * spaces or requests are in play. The alternative — resolving each request's
 * workspace separately — is the N+1 that makes an approvals list unusable at
 * fifty pending requests.
 */
export async function coverRosters(
  prisma: PrismaService,
  calendarRules: CalendarRulesService,
  organizationId: string,
  spaceIds: string[],
  window?: { from: DateKey; to: DateKey },
) {
  const bySpace = new Map<string, CoverPerson[]>();
  if (!spaceIds.length) return bySpace;

  const assignments = await prisma.spaceAssignment.findMany({
    where: {
      organizationId,
      spaceId: { in: spaceIds },
      ...notEndedWhere(),
      user: { isActive: true },
    },
    select: {
      spaceId: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialty: true,
          position: true,
          // `startTime` is what makes "due 08:00 · 2h 42m ago" possible.
          // Without it the panel can only say "not clocked in", which names a
          // state nobody can act on.
          schedules: { where: { isActive: true }, select: { dayOfWeek: true, startTime: true } },
        },
      },
    },
  });

  const userIds = [...new Set(assignments.map((a) => a.user.id))];
  const shifts = userIds.length
    ? await prisma.shiftAssignment.findMany({
        where: { organizationId, userId: { in: userIds }, spaceId: { in: spaceIds }, isActive: true },
        select: {
          userId: true,
          spaceId: true,
          recurrence: true,
          daysOfWeek: true,
          daysOfMonth: true,
          dates: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      })
    : [];

  for (const s of spaceIds) bySpace.set(s, []);
  for (const a of assignments) {
    const list = bySpace.get(a.spaceId);
    if (!list) continue;
    // A member can hold two assignments in one space over time; count them once.
    if (list.some((p) => p.id === a.user.id)) continue;
    list.push({
      id: a.user.id,
      firstName: a.user.firstName,
      lastName: a.user.lastName,
      spaceId: a.spaceId,
      specialty: a.user.specialty,
      position: a.user.position,
      scheduleDows: [...new Set(a.user.schedules.map((s) => s.dayOfWeek))],
      startByDow: Object.fromEntries(a.user.schedules.map((s) => [s.dayOfWeek, s.startTime])),
      shiftRules: shifts.filter((r) => r.userId === a.user.id && r.spaceId === a.spaceId).map(shiftRuleOf),
    });
  }
  return window ? withCalendar(calendarRules, organizationId, bySpace, window.from, window.to) : bySpace;
}

/** Approved leave for these people, overlapping this window. One query. */
export async function approvedLeave(
  prisma: PrismaService,
  personIds: string[],
  from: DateKey,
  to: DateKey,
): Promise<CoverLeave[]> {
  if (!personIds.length) return [];
  const rows = await prisma.timeOff.findMany({
    where: {
      technicianId: { in: personIds },
      status: 'APPROVED',
      // Only leave thins cover — somebody working remotely is still working.
      ...ABSENCE_WHERE,
      startDate: { lte: new Date(`${to}T23:59:59.999Z`) },
      endDate: { gte: new Date(`${from}T00:00:00.000Z`) },
    },
    select: { id: true, technicianId: true, startDate: true, endDate: true },
  });
  return rows.map((r) => ({
    id: r.id,
    personId: r.technicianId,
    from: coverDayKey(r.startDate),
    to: coverDayKey(r.endDate),
  }));
}

/**
 * Which workspace does this person's absence thin?
 *
 * Their primary assignment, falling back to the first — the same choice the
 * availability calendar already makes, so the two screens name the same place.
 */
export async function spaceOfEach(prisma: PrismaService, organizationId: string, personIds: string[]) {
  const out = new Map<string, string>();
  if (!personIds.length) return out;
  const rows = await prisma.spaceAssignment.findMany({
    where: {
      organizationId,
      userId: { in: personIds },
      ...notEndedWhere(),
    },
    select: { userId: true, spaceId: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  for (const r of rows) if (!out.has(r.userId)) out.set(r.userId, r.spaceId);
  return out;
}
