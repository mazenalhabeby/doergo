import { isJoinableFragment, joinFragment, joinedFlags, type FragmentCandidate } from '../core/clock-in-join';
import type { JoiningClockIn } from '../core/clock-in-join';

/** One entry per shift: an automatic fragment followed by a clock-in for the same shift joins. */
const base: FragmentCandidate = {
  id: 'frag',
  clockInAt: new Date('2026-10-13T21:56:24Z'),
  clockOutAt: new Date('2026-10-13T21:56:35Z'),
  flagReasons: ['RECORDED_OFFLINE', 'AUTO_CLOCK_IN', 'EARLY_DEPARTURE'],
  labelRules: 1,
  labelFacts: {
    shift: null,
    firstOfShift: true,
    clockIn: { judged: true, metresOutside: 0 },
    closedHow: 'CLOCKED_OUT',
    departureByPhone: true,
  },
  breakPlan: [],
};
const at = new Date('2026-10-13T21:56:44Z'); // the member's own tap, 9 s after the fragment closed
const joining = (over: Partial<JoiningClockIn> = {}): JoiningClockIn => ({
  userId: 'u1',
  clockInId: 'tap-2',
  nextRemindAt: null,
  now: at,
  flags: [],
  isRemote: false,
  awayReason: null,
  ...over,
});

describe('one entry per shift — which earlier entry is joined', () => {
  it('the 11-second automatic fragment (Matias, 13 Oct) is joined', () => {
    expect(isJoinableFragment(base, at)).toBe(true);
  });
  it('a real shift part (longer than 2 min) is not', () => {
    expect(isJoinableFragment({ ...base, clockInAt: new Date('2026-10-13T18:00:00Z') }, at)).toBe(false);
  });
  it('a clock-in long after the fragment is a new arrival, not the same one', () => {
    expect(isJoinableFragment(base, new Date('2026-10-13T22:30:00Z'))).toBe(false);
  });
  it('a manual fragment, an accepted automatic clock-out, or an old entry: never joined', () => {
    expect(isJoinableFragment({ ...base, flagReasons: ['EARLY_DEPARTURE'] }, at)).toBe(false);
    expect(isJoinableFragment({ ...base, flagReasons: ['AUTO_CLOCK_IN', 'AUTO_CLOCK_OUT'] }, at)).toBe(false);
    expect(isJoinableFragment({ ...base, labelRules: null }, at)).toBe(false);
    expect(isJoinableFragment(null, at)).toBe(false);
  });
  it("the person's own clock-out is real — a clock-in after it opens a new entry", () => {
    const facts = { ...(base.labelFacts as object), departureByPhone: undefined };
    expect(isJoinableFragment({ ...base, labelFacts: facts }, at)).toBe(false);
  });
});

describe('one entry per shift — the join', () => {
  it('reopens the fragment: no Left early, no clock-out, the joining id remembered', async () => {
    const prisma = {
      timeEntry: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'frag' }),
      },
    };
    const row = await joinFragment(prisma as never, base, joining());
    expect(row).toEqual({ id: 'frag' });
    const { where, data } = prisma.timeEntry.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'frag', status: 'CLOCKED_OUT', clockOutAt: base.clockOutAt });
    expect(data.status).toBe('CLOCKED_IN');
    expect(data.clockOutAt).toBeNull();
    expect(data.flagReasons).toEqual(['RECORDED_OFFLINE', 'AUTO_CLOCK_IN']);
    expect(data.approvalStatus).toBe('AUTO');
    expect(data.labelFacts.joinedClockInIds).toEqual(['tap-2']);
    expect(data.labelFacts.closedHow).toBeUndefined();
    expect(data.labelFacts.departureByPhone).toBeUndefined();
  });
  it("merges the JOINING clock-in's own labels and away facts, and sends it to review for them", async () => {
    const prisma = {
      timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn() },
    };
    const own = ['OUTSIDE_GEOFENCE_IN', 'FIX_MOCKED', 'CLOCK_SUSPECT', 'PAST_DAILY_LIMIT', 'TIME_UNVERIFIED'];
    await joinFragment(prisma as never, base, joining({ flags: own, isRemote: true, awayReason: 'Client visit' }));
    const { data } = prisma.timeEntry.updateMany.mock.calls[0][0];
    expect(data.flagReasons).toEqual(['RECORDED_OFFLINE', 'AUTO_CLOCK_IN', ...own]);
    expect(data.approvalStatus).toBe('PENDING');
    expect(data).toMatchObject({ isRemote: true, awayReason: 'Client visit' });
  });
  it('the joining arrival is the same arrival: never late back from a rest, never late again', () => {
    expect(joinedFlags(['AUTO_CLOCK_IN', 'OVERTIME'], ['LATE_FROM_REST', 'LATE_ARRIVAL', 'RECORDED_OFFLINE'])).toEqual([
      'AUTO_CLOCK_IN',
      'RECORDED_OFFLINE',
    ]);
  });
  it('a shift opened meanwhile (one open shift per member, P2002) is ALREADY_CLOCKED_IN, never a 500', async () => {
    const open = { id: 'other', locationId: 'loc', clockInAt: at, location: { name: 'Yard' } };
    const prisma = {
      timeEntry: {
        updateMany: jest.fn().mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' })),
        findFirst: jest.fn().mockResolvedValue(open),
        findUnique: jest.fn(),
      },
    };
    await expect(joinFragment(prisma as never, base, joining())).rejects.toMatchObject({
      response: { code: 'ALREADY_CLOCKED_IN' },
    });
    expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toEqual({ userId: 'u1', status: 'CLOCKED_IN' });
  });
  it('a lost claim (somebody else changed it) returns null — the clock-in is recorded as before', async () => {
    const prisma = { timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findUnique: jest.fn() } };
    expect(await joinFragment(prisma as never, base, joining())).toBeNull();
    expect(prisma.timeEntry.findUnique).not.toHaveBeenCalled();
  });
});
