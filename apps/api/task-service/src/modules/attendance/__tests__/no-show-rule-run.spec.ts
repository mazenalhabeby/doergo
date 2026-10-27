import { NoShowRecordService } from '../no-shows/no-show-record.service';

/*
  ⚠️ An office rule on missed clock-ins is about the RUN. The inbox shows a run as its newest day, and the
  leader may decide it from any of its days — so the step is kept under the newest day and found from any of
  them, and the days counted are the ones the decision closes (the whole run, or one day).
*/
describe('a rule on missed clock-ins follows the run', () => {
  const day = (n: number) => ({
    id: `d${n}`,
    userId: 'member',
    spaceId: 's1',
    shiftId: 'sh1',
    organizationId: 'o',
    state: 'ESCALATED',
    localDate: `2026-10-0${n}`,
    expectedClockInAt: new Date(`2026-10-0${n}T08:00:00Z`),
  });
  function setup() {
    const prisma: any = {
      shiftInstance: {
        findFirst: jest.fn().mockResolvedValue(day(1)),
        findMany: jest.fn().mockResolvedValue([day(1), day(2), day(3)]),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const rules: any = {
      decide: jest.fn(async (_input: unknown, write: () => Promise<unknown>) => ({ done: await write() })),
      clear: jest.fn(),
    };
    return { prisma, rules, svc: new NoShowRecordService(prisma, rules) };
  }
  const resolve = (svc: NoShowRecordService, over: Record<string, unknown>) =>
    svc.resolve({ id: 'd1', organizationId: 'o', action: 'excuse', excusedById: 'leader', ...over } as never);

  it('excusing the whole run asks under its newest day, found from any of them, for all its days', async () => {
    const { svc, rules } = setup();
    await resolve(svc, { wholeRun: true });
    expect(rules.decide).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'd3', itemAliases: ['d1', 'd2', 'd3'], facts: { spaceIds: ['s1'], days: 3 } }),
      expect.any(Function),
    );
  });

  /*
    ⚠️ One day at a time is no way round a "3 days in a row" rule: a single-day excuse is judged on the WHOLE run,
    under the same step — five days excused one by one still need the people the rule names.
  */
  it("excusing ONE day of a run is still judged on the whole run, under the run's step", async () => {
    const { svc, rules } = setup();
    await resolve(svc, {});
    expect(rules.decide).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'd3', itemAliases: ['d1', 'd2', 'd3'], facts: { spaceIds: ['s1'], days: 3 } }),
      expect.any(Function),
    );
  });

  /*
    ⚠️ Nor is answering one day "absent": D3 marked absent cut D1–D5 into two runs, each excused by one person,
    then D3 reopened and excused alone. A day a PERSON answered still counts in the run the rule judges.
  */
  it('a day already answered by a person does not split the run the rule judges', async () => {
    const { svc, rules, prisma } = setup();
    const answered = (n: number, state: string, auto = false) => ({ ...day(n), state, closedAutomatically: auto });
    prisma.shiftInstance.findMany.mockResolvedValue([
      day(1),
      day(2),
      answered(3, 'ABSENT'),
      answered(4, 'EXCUSED'),
      answered(5, 'EXCUSED', true), // closed by the system (they were there): the run ends here
    ]);
    await resolve(svc, {});
    expect(rules.decide).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'd2', facts: { spaceIds: ['s1'], days: 4 } }),
      expect.any(Function),
    );
  });

  it('marking absent ends the step of the whole run', async () => {
    const { svc, rules } = setup();
    await resolve(svc, { action: 'absent' });
    expect(rules.clear).toHaveBeenCalledWith('o', 'noShow', ['d1', 'd2', 'd3']);
    expect(rules.decide).not.toHaveBeenCalled();
  });
});
