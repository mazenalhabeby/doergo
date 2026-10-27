import { RequestPrecheckService } from '../request-precheck.service';

/*
  What a leader would check, answered for the member before they send. Every
  answer is an existing reader; this pins how they are put together — and that
  cover reaches the member as a LEVEL only.
*/
describe('RequestPrecheckService', () => {
  const prisma: any = {
    // Other leave the request would join (leave-stretch.ts): none unless a test says so.
    timeOff: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findFirst: jest.fn().mockResolvedValue({ spaceAssignments: [{ spaceId: 's1' }] }) },
    spaceAssignment: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { space: { id: 's1', timezone: 'Europe/Vienna', workModel: 'SHIFTS', lat: null, lng: null } },
        ]),
    },
  };
  const technicians: any = {
    requestClashes: jest.fn().mockResolvedValue([]),
    countWorkingDays: jest.fn().mockResolvedValue(3),
  };
  const cover: any = {
    assessMany: jest
      .fn()
      .mockResolvedValue(new Map([['precheck', { level: 'short', worst: 1, floor: 2, names: ['Lisa'] }]])),
  };
  const ledger: any = { getBalance: jest.fn().mockResolvedValue({ remaining: 2 }) };
  const resolver: any = { plannedWindows: jest.fn() };
  // The calendar: the days between two requests are days off (a weekend) unless a test says otherwise.
  const calendar: any = { countLeaveFor: jest.fn().mockResolvedValue({ counted: 0 }) };
  const moduleRef: any = {
    get: jest.fn((cls: { name: string }) => (cls.name === 'CalendarRulesService' ? calendar : resolver)),
  };
  const rules: any = { approvalsNeededFor: jest.fn().mockResolvedValue(null) };
  const svc = new RequestPrecheckService(prisma, technicians, cover, ledger, moduleRef, rules);
  const who = { userId: 'me', organizationId: 'o' };

  beforeEach(() => jest.clearAllMocks());

  it('leave: working days, balance before → after, cover as a level only, the rule that would apply', async () => {
    rules.approvalsNeededFor.mockResolvedValueOnce('Space Manager');
    const r = await svc.precheck({
      ...who,
      body: { kind: 'LEAVE', type: 'VACATION', startDate: '2026-11-03', endDate: '2026-11-05' },
    });
    expect(r).toEqual({
      workingDays: 3,
      balance: { before: 2, after: -1 },
      clashes: [],
      cover: 'short',
      dailyLimit: null,
      secondApproval: 'Space Manager',
    });
    expect(JSON.stringify(r)).not.toContain('Lisa');
    expect(rules.approvalsNeededFor).toHaveBeenCalledWith(
      'o',
      'request',
      expect.objectContaining({ days: 3, coverShort: true, spaceIds: ['s1'] }),
    );
  });

  it('a clash with their own request is said before sending', async () => {
    technicians.requestClashes.mockResolvedValueOnce([
      { kind: 'LEAVE', startDate: new Date('2026-11-04'), endDate: new Date('2026-11-06'), status: 'PENDING' },
    ]);
    const r = await svc.precheck({
      ...who,
      body: { kind: 'LEAVE', type: 'SICK', startDate: '2026-11-03', endDate: '2026-11-05' },
    });
    expect(r.clashes).toEqual([{ kind: 'LEAVE', startDate: '2026-11-04', endDate: '2026-11-06', status: 'PENDING' }]);
    expect(r.balance).toBeNull(); // sick leave is not deducted
  });

  it('overtime: the planned day plus what is asked, against the daily guide', async () => {
    const day = '2026-11-03';
    resolver.plannedWindows.mockResolvedValueOnce(
      new Map([
        [
          's1',
          [
            {
              dateStr: day,
              shiftId: 'x',
              expectedClockInAt: new Date(`${day}T06:00:00Z`),
              expectedClockOutAt: new Date(`${day}T14:30:00Z`),
            },
          ],
        ],
      ]),
    );
    const r = await svc.precheck({ ...who, body: { kind: 'OVERTIME', startDate: day, endDate: day, minutes: 120 } });
    expect(r.dailyLimit).toEqual({ plannedMinutes: 510, requestedMinutes: 120, limitMinutes: 600, over: true });
    expect(r.cover).toBeNull();
    expect(rules.approvalsNeededFor).toHaveBeenCalledWith('o', 'overtime', expect.objectContaining({ minutes: 120 }));
  });

  it('a body the request parser refuses is refused here the same way', async () => {
    await expect(svc.precheck({ ...who, body: { kind: 'LEAVE' } })).rejects.toMatchObject({
      response: { code: expect.any(String) },
    });
  });

  it('leave right after leave already asked for: judged on the whole stretch, as the approval will be', async () => {
    // Already asked: Mon–Fri 2026-10-26..30 (5 days). This request: Mon–Wed 2026-11-02..04 (3) — only a weekend between.
    prisma.timeOff.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        technicianId: 'me',
        startDate: new Date('2026-10-26'),
        endDate: new Date('2026-10-30'),
        workingDays: 5,
      },
    ]);
    await svc.precheck({
      ...who,
      body: { kind: 'LEAVE', type: 'VACATION', startDate: '2026-11-02', endDate: '2026-11-04' },
    });
    expect(rules.approvalsNeededFor).toHaveBeenCalledWith('o', 'request', expect.objectContaining({ days: 8 }));
  });
});
