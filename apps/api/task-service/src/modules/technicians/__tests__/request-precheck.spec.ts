import { RequestPrecheckService } from '../request-precheck.service';

/*
  What a leader would check, answered for the member before they send. Every
  answer is an existing reader; this pins how they are put together — and that
  cover reaches the member as a LEVEL only.
*/
describe('RequestPrecheckService', () => {
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue({ spaceAssignments: [{ spaceId: 's1' }] }) },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([{ space: { id: 's1', timezone: 'Europe/Vienna', workModel: 'SHIFTS', lat: null, lng: null } }]) },
  };
  const technicians: any = {
    requestClashes: jest.fn().mockResolvedValue([]),
    countWorkingDays: jest.fn().mockResolvedValue(3),
  };
  const cover: any = { assessMany: jest.fn().mockResolvedValue(new Map([['precheck', { level: 'short', worst: 1, floor: 2, names: ['Lisa'] }]])) };
  const ledger: any = { getBalance: jest.fn().mockResolvedValue({ remaining: 2 }) };
  const resolver: any = { plannedWindows: jest.fn() };
  const moduleRef: any = { get: jest.fn().mockReturnValue(resolver) };
  const rules: any = { secondStepFor: jest.fn().mockResolvedValue(null) };
  const svc = new RequestPrecheckService(prisma, technicians, cover, ledger, moduleRef, rules);
  const who = { userId: 'me', organizationId: 'o' };

  beforeEach(() => jest.clearAllMocks());

  it('leave: working days, balance before → after, cover as a level only, the rule that would apply', async () => {
    rules.secondStepFor.mockResolvedValueOnce('Space Manager');
    const r = await svc.precheck({ ...who, body: { kind: 'LEAVE', type: 'VACATION', startDate: '2026-11-03', endDate: '2026-11-05' } });
    expect(r).toEqual({ workingDays: 3, balance: { before: 2, after: -1 }, clashes: [], cover: 'short', dailyLimit: null, secondApproval: 'Space Manager' });
    expect(JSON.stringify(r)).not.toContain('Lisa');
    expect(rules.secondStepFor).toHaveBeenCalledWith('o', 'request', expect.objectContaining({ days: 3, coverShort: true, spaceIds: ['s1'] }));
  });

  it('a clash with their own request is said before sending', async () => {
    technicians.requestClashes.mockResolvedValueOnce([{ kind: 'LEAVE', startDate: new Date('2026-11-04'), endDate: new Date('2026-11-06'), status: 'PENDING' }]);
    const r = await svc.precheck({ ...who, body: { kind: 'LEAVE', type: 'SICK', startDate: '2026-11-03', endDate: '2026-11-05' } });
    expect(r.clashes).toEqual([{ kind: 'LEAVE', startDate: '2026-11-04', endDate: '2026-11-06', status: 'PENDING' }]);
    expect(r.balance).toBeNull(); // sick leave is not deducted
  });

  it('overtime: the planned day plus what is asked, against the daily guide', async () => {
    const day = '2026-11-03';
    resolver.plannedWindows.mockResolvedValueOnce(new Map([['s1', [{ dateStr: day, shiftId: 'x', expectedClockInAt: new Date(`${day}T06:00:00Z`), expectedClockOutAt: new Date(`${day}T14:30:00Z`) }]]]));
    const r = await svc.precheck({ ...who, body: { kind: 'OVERTIME', startDate: day, endDate: day, minutes: 120 } });
    expect(r.dailyLimit).toEqual({ plannedMinutes: 510, requestedMinutes: 120, limitMinutes: 600, over: true });
    expect(r.cover).toBeNull();
    expect(rules.secondStepFor).toHaveBeenCalledWith('o', 'overtime', expect.objectContaining({ minutes: 120 }));
  });

  it('a body the request parser refuses is refused here the same way', async () => {
    await expect(svc.precheck({ ...who, body: { kind: 'LEAVE' } })).rejects.toMatchObject({ response: { code: expect.any(String) } });
  });
});
