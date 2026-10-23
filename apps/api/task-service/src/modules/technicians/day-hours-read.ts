import { localPartsIn, personName, toISODateString, zoneOf, type DayHoursView, type PrismaService } from '@hbcfield/shared';
import type { ShiftResolverService } from '../attendance/core/shift-resolver.service';

/*
  What the "Change hours for this day" form shows before anything is changed
  (docs/plans/time-counting-model.md, phase 2): the day's plan from the rota, hours the office
  already set for it, whether the person is clocked in that day, and leave that would refuse it.
  Every answer is an existing reader; times are read in the WORKSPACE's zone, like the clock.
*/

const hhmm = (instant: Date, tz: string) => {
  const m = localPartsIn(instant, tz).minutesOfDay;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export async function readDayHours(
  prisma: PrismaService,
  resolver: Pick<ShiftResolverService, 'plannedWindows'>,
  input: { organizationId: string; technicianId: string; date: string; spaceId: string },
): Promise<DayHoursView> {
  const { technicianId, date, spaceId } = input;
  const day = new Date(`${date}T00:00:00.000Z`);
  const space = await prisma.companyLocation.findFirst({
    where: { id: spaceId, organizationId: input.organizationId },
    select: { id: true, timezone: true, workModel: true, lat: true, lng: true },
  });
  const tz = zoneOf(space?.timezone);
  const [windows, changed, entries, leave] = await Promise.all([
    space
      ? resolver.plannedWindows(technicianId, [{ ...space, timezone: tz }] as never, () => [date]).catch(() => new Map())
      : Promise.resolve(new Map()),
    prisma.timeOff.findFirst({
      where: { technicianId, kind: 'HOURS', status: 'APPROVED', startDate: day, endDate: day, spaceId },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        reason: true,
        approvedAt: true,
        approvedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId: technicianId,
        locationId: spaceId,
        clockInAt: { gte: new Date(day.getTime() - 86_400_000), lt: new Date(day.getTime() + 2 * 86_400_000) },
        approvalStatus: { not: 'REJECTED' },
      },
      select: { clockInAt: true, clockOutAt: true },
      orderBy: { clockInAt: 'asc' },
    }),
    prisma.timeOff.findFirst({
      where: { technicianId, kind: 'LEAVE', status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: day }, endDate: { gte: day } },
      select: { startDate: true, endDate: true, status: true },
    }),
  ]);

  const window = [...windows.values()].flat().find((w) => w.dateStr === date) ?? null;
  const shiftName = window?.shiftId
    ? ((await prisma.shift.findUnique({ where: { id: window.shiftId }, select: { name: true } }))?.name ?? null)
    : null;
  const first = entries.find((e) => localPartsIn(e.clockInAt, tz).dateStr === date) ?? null;
  return {
    timezone: tz,
    plan: window
      ? { start: hhmm(window.expectedClockInAt, tz), end: hhmm(window.expectedClockOutAt, tz), name: shiftName }
      : null,
    changed: changed
      ? {
          id: changed.id,
          startTime: changed.startTime,
          endTime: changed.endTime,
          reason: changed.reason,
          setBy: changed.approvedBy ? personName(changed.approvedBy) : null,
          setAt: changed.approvedAt ? changed.approvedAt.toISOString() : null,
        }
      : null,
    clockedIn: first ? { at: hhmm(first.clockInAt, tz), open: !first.clockOutAt } : null,
    leave: leave
      ? { from: toISODateString(leave.startDate), to: toISODateString(leave.endDate), status: leave.status }
      : null,
  };
}
