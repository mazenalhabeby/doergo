import { LeaveEditsService } from '../leave-edits.service';
import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';

/*
  Changing the DATES of leave on the record is a new decision: approvals given for the old dates end, nobody
  moves their own, and approved leave now past an office rule waits again — the editor's change is its first
  approval. A note-only edit changes nothing else.
*/
describe('LeaveEditsService.updateTimeOff', () => {
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
  const row = (status: string) => ({
    id: 't1',
    technicianId: 'member',
    kind: 'VACATION',
    spaceId: 's1',
    status,
    startDate: day('2026-11-02'),
    endDate: day('2026-11-02'),
    workingDays: 1,
    technician: { spaceAssignments: [{ spaceId: 's1' }] },
  });
  function make(status: string, rules = noOfficeRules() as any) {
    const prisma: any = {
      timeOff: {
        findFirst: jest.fn().mockResolvedValueOnce(row(status)).mockResolvedValueOnce(null),
        update: jest.fn(async ({ data }: any) => ({ id: 't1', ...data })),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const calendar = { countWorkingDays: jest.fn() };
    const svc = new LeaveEditsService(prisma, rules, { assessMany: jest.fn() } as any, calendar as any);
    jest.spyOn(require('../member-requests'), 'workingDaysOf').mockResolvedValue(15);
    return { svc, prisma, rules };
  }
  const edit = { editorId: 'leader', organizationId: 'o', timeOffId: 't1' };

  it('a note only: no rule asked, no approvals ended', async () => {
    const { svc, rules } = make('APPROVED');
    await svc.updateTimeOff({ ...edit, reason: 'dentist' });
    expect(rules.clear).not.toHaveBeenCalled();
    expect(rules.decide).not.toHaveBeenCalled();
  });

  it('new dates: the old approvals end, and approved leave is judged again on them', async () => {
    const { svc, rules } = make('APPROVED');
    await svc.updateTimeOff({ ...edit, endDate: '2026-11-20' });
    expect(rules.clear).toHaveBeenCalledWith('o', 'request', 't1');
    expect(rules.decide).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 't1', deciderId: 'leader', facts: expect.objectContaining({ days: 15 }) }),
      expect.any(Function),
    );
  });

  it('past an office rule: it waits again — PENDING, nobody approved yet', async () => {
    const rules = {
      ...(noOfficeRules() as any),
      decide: jest.fn().mockResolvedValue({ waiting: { stage: 'FIRST_STEP', waitingFor: 'HR' } }),
    };
    const { svc, prisma } = make('APPROVED', rules);
    const res: any = await svc.updateTimeOff({ ...edit, endDate: '2026-11-20' });
    expect(prisma.timeOff.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', approvedById: null }) }),
    );
    expect(res.data.waitingFor).toBe('HR');
  });

  it('nobody moves their own leave (an administrator excepted)', async () => {
    const { svc } = make('APPROVED');
    await expect(svc.updateTimeOff({ ...edit, editorId: 'member', endDate: '2026-11-20' })).rejects.toMatchObject({
      status: 403,
    });
  });
});
