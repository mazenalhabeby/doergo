import { ClockInLocationsService } from '../clock-in/clock-in-locations.service';
import { ClockInContextService } from '../clock-in/clock-in-context.service';

/*
  One day for the person, at every workspace.

  "Today" was counted in each WORKSPACE's own zone, so one session read
  differently everywhere: a shift that ended 06:10 in Vienna showed 6h 11m at
  a Vienna workspace, 11m at a New York one and over 12h at a Chicago one — on
  one screen, with a refusal at one and hours "left" at the next.
*/
describe("the no-shift limit counts the MEMBER's day", () => {
  // A session 18:52 → 04:10 UTC (Chicago evening → Vienna early morning).
  const session = {
    clockInAt: new Date('2026-10-13T18:52:00Z'),
    clockOutAt: new Date('2026-10-14T04:10:00Z'),
    paidMinutes: 558,
    totalMinutes: 558,
    unpaidBreakMinutes: 0,
  };
  const now = new Date('2026-10-14T04:11:00Z');

  const harness = (memberTz: string | null, orgTz: string) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ timezone: memberTz, organization: { timezone: orgTz } }) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([session]) },
      timeOff: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const self: any = Object.create(ClockInLocationsService.prototype);
    self.prisma = prisma;
    self.shiftResolver = { resolveForClockIn: jest.fn().mockResolvedValue(null) };
    // The shared clock-in helpers are a collaborator now; it reads the same prisma double.
    self.context = Object.assign(Object.create(ClockInContextService.prototype), { prisma });
    return { self, prisma };
  };
  const spaces = [
    { id: 'vienna', timezone: 'Europe/Vienna', workModel: 'NONE', noShiftPolicy: 'LIMIT', noShiftDailyMinutes: 480 },
    { id: 'ny', timezone: 'America/New_York', workModel: 'NONE', noShiftPolicy: 'LIMIT', noShiftDailyMinutes: 720 },
    { id: 'chicago', timezone: 'America/Chicago', workModel: 'NONE', noShiftPolicy: 'LIMIT', noShiftDailyMinutes: 720 },
  ] as any[];

  it('every workspace reports the same hours and the same day end', async () => {
    const { self, prisma } = harness('Europe/Vienna', 'America/Chicago');
    const tagged = await self.tagClockInContext(spaces, 'u1', now, new Set());
    const worked = new Set(tagged.map((s: any) => s.noShift.workedTodayMinutes));
    const ends = new Set(tagged.map((s: any) => s.noShift.dayEndsAt));
    expect(worked.size).toBe(1);
    expect(ends.size).toBe(1);
    // The session STARTED 20:52 Vienna on the 13th: it belongs to that day, not to the member's today.
    expect([...worked][0]).toBe(0);
    // Today's hours are read ONCE, and the member once, whatever the number of workspaces.
    expect(prisma.timeEntry.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it("a member with no zone of their own counts their main workspace's day, not the organization's", async () => {
    const { self } = harness(null, 'Europe/Vienna');
    const tagged = await self.tagClockInContext(spaces, 'u1', now, new Set(['chicago']));
    // Chicago: the session started and it is still Oct 13 → 558 minutes, the same everywhere.
    expect(tagged.map((s: any) => s.noShift.workedTodayMinutes)).toEqual([558, 558, 558]);
  });
});
