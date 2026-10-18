import { rematchLabels } from '../rematch-labels';

/** A new entry matched to a shift added later — judged like a clock-in. */
const facts = { shift: null, firstOfShift: true, clockIn: { judged: true, metresOutside: 0 } };
const resolved = {
  shiftId: 'sh',
  shiftName: 'Day',
  expectedClockInAt: new Date('2026-10-13T06:00:00Z'),
  expectedClockOutAt: new Date('2026-10-13T14:00:00Z'),
  flagToleranceMin: 10,
};
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e2',
  userId: 'u1',
  locationId: 'loc',
  clockInAt: new Date('2026-10-13T06:30:00Z'),
  clockOutAt: null,
  timezone: 'Europe/Vienna',
  labelRules: 1,
  labelFacts: facts,
  location: { timezone: 'Europe/Vienna' },
  ...over,
});
const prismaWith = (prior: unknown, requests: unknown[] = []) => ({
  timeEntry: { findFirst: jest.fn().mockResolvedValue(prior) },
  timeOff: { findMany: jest.fn().mockResolvedValue(requests) },
});

describe('re-match labels', () => {
  it('an old entry: null — the caller keeps today’s path', async () => {
    expect(
      await rematchLabels(prismaWith(null) as never, entry({ labelRules: null, labelFacts: null }), resolved),
    ).toBeNull();
  });

  it('the first entry of the shift, 30 min after the start: late; the facts gain the shift', async () => {
    const r = await rematchLabels(prismaWith(null) as never, entry(), resolved);
    expect(r?.flags).toEqual(['LATE_ARRIVAL']);
    expect((r?.labelFacts as { shift: { name: string } }).shift.name).toBe('Day');
  });

  it('a second entry of the shift: never late, its rest judged', async () => {
    const prior = {
      clockOutAt: new Date('2026-10-13T10:00:00Z'),
      breakPlan: [{ state: 'PENDING', dueAt: '2026-10-13T10:00:00Z', durationMinutes: 30 }],
    };
    const r = await rematchLabels(
      prismaWith(prior) as never,
      entry({ clockInAt: new Date('2026-10-13T11:00:00Z') }),
      resolved,
    );
    expect(r?.flags).toEqual(['LATE_FROM_REST']);
  });

  it('agreed hours move the start before lateness is judged (used to be ignored here)', async () => {
    const hours = {
      id: 'r1',
      kind: 'HOURS',
      spaceId: null,
      startTime: '08:45',
      endTime: null,
      minutes: null,
      startDate: new Date('2026-10-13T00:00:00Z'),
      endDate: new Date('2026-10-13T00:00:00Z'),
    };
    const r = await rematchLabels(prismaWith(null, [hours]) as never, entry(), resolved);
    expect(r?.flags).toEqual([]);
    expect(r?.expectedClockInAt.toISOString()).toBe('2026-10-13T06:45:00.000Z');
  });
});
