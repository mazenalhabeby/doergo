import { approvedOvertimeByEntry, lastRoundCycle } from '../extra-time/overtime-rule-facts';

/*
  What an office rule on overtime counts as ALREADY approved on a shift: every approved round, and time outside
  the shift counted BEFORE the planned start (its part after the end is a round already). 55 minutes before the
  start and 55 added after are 110 — never two decisions of 55.
*/
describe('overtime already approved on a shift', () => {
  it('approved rounds plus the time counted before the start, per shift, in two queries', async () => {
    const prisma: any = {
      overtimeRequest: {
        groupBy: jest.fn().mockResolvedValue([{ timeEntryId: 'e1', _sum: { maxDurationMinutes: 55 } }]),
      },
      timeEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', outsideBeforeMinutes: 55 },
          { id: 'e2', outsideBeforeMinutes: 20 },
        ]),
      },
    };
    const got = await approvedOvertimeByEntry(prisma, ['e1', 'e2']);
    expect(got.get('e1')).toBe(110);
    expect(got.get('e2')).toBe(20);
  });

  it('the last round’s number — the next round written is numbered after it', async () => {
    const prisma: any = { overtimeRequest: { findFirst: jest.fn().mockResolvedValue({ cycle: 2 }) } };
    expect(await lastRoundCycle(prisma, 'e1')).toBe(2);
    prisma.overtimeRequest.findFirst.mockResolvedValue(null);
    expect(await lastRoundCycle(prisma, 'e1')).toBe(0);
  });
});
