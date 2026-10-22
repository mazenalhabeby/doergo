import { departureFlagsAfterEndMoved, relabelAfterEndMoved } from '../extra-time/label-end-moved';

/** Approved extra time moves the planned end — new entries' departure labels follow it. */
const facts = {
  shift: {
    id: 's',
    name: null,
    expectedStartAt: '2026-10-13T06:00:00.000Z',
    expectedEndAt: '2026-10-13T14:00:00.000Z',
    toleranceMin: 10,
    endIsDailyLimit: false,
  },
  firstOfShift: true,
  clockIn: { judged: true, metresOutside: 0 },
};
const out = new Date('2026-10-13T15:00:00Z');

describe('labels after the planned end moved', () => {
  it('an hour of approved extra time: the clock-out at 15:00 is no longer Overtime', () => {
    expect(
      departureFlagsAfterEndMoved({
        flags: ['OVERTIME', 'OUTSIDE_GEOFENCE_OUT'],
        clockOutAt: out,
        expectedClockOutAt: new Date('2026-10-13T15:00:00Z'),
        toleranceMin: 10,
        endIsDailyLimit: false,
      }),
    ).toEqual(['OUTSIDE_GEOFENCE_OUT']);
  });

  it('a new closed entry is relabelled and its status follows (one update, no extra read)', async () => {
    const prisma = { timeEntry: { update: jest.fn().mockResolvedValue({}) } };
    await relabelAfterEndMoved(
      prisma as never,
      {
        id: 'e1',
        labelRules: 1,
        labelFacts: facts,
        clockOutAt: out,
        flagReasons: ['OVERTIME'],
        approvalStatus: 'PENDING',
      },
      new Date('2026-10-13T15:00:00Z'),
    );
    const data = prisma.timeEntry.update.mock.calls[0][0].data;
    expect(data.flagReasons).toEqual([]);
    expect(data.approvalStatus).toBe('AUTO');
    expect(data.labelFacts.shift.expectedEndAt).toBe('2026-10-13T15:00:00.000Z');
  });

  it('a decision a person made stays', async () => {
    const prisma = { timeEntry: { update: jest.fn().mockResolvedValue({}) } };
    await relabelAfterEndMoved(
      prisma as never,
      {
        id: 'e1',
        labelRules: 1,
        labelFacts: facts,
        clockOutAt: out,
        flagReasons: ['OVERTIME'],
        approvalStatus: 'APPROVED',
      },
      new Date('2026-10-13T15:00:00Z'),
    );
    expect(prisma.timeEntry.update.mock.calls[0][0].data.approvalStatus).toBeUndefined();
  });

  it('an old entry is not touched at all', async () => {
    const prisma = { timeEntry: { update: jest.fn() } };
    await relabelAfterEndMoved(prisma as never, { id: 'e1', labelRules: null, flagReasons: ['OVERTIME'] }, out);
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });
});
