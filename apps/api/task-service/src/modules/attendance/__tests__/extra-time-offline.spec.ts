import { noOfficeRules } from '../../approvals/__tests__/no-office-rules';
/**
 * Overtime when the phone had no signal.
 *
 * The member asks for extra time at 17:05 and clocks out at 18:40, both without
 * signal; both arrive at 19:30, in that order. A leader must still be able to
 * approve the ninety minutes, and the timesheet must then pay them.
 */
// The rules are still imported from the facade (re-exported); approving lives in ExtraTimeApprovalService.
import { decidableExtraTimeWhere, respondedAt } from '../attendance.service';
import { ExtraTimeApprovalService } from '../extra-time/extra-time-approval.service';
import { ExtraTimeDecisionService } from '../extra-time/extra-time-decision.service';

const at = (hhmm: string) => new Date(`2026-09-14T${hhmm}:00.000Z`);

function service(entry: any, round: any = { id: 'round-1' }) {
  const svc = Object.create(ExtraTimeApprovalService.prototype) as any;
  svc.logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn() };
  svc.rules = noOfficeRules();
  svc.prisma = {
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(entry),
      update: jest.fn((args: any) => ({ kind: 'entry.update', args })),
      updateMany: jest.fn((args: any) => ({ kind: args.where.status ? 'entry.nudge' : 'entry.outsideDecided', args })),
    },
    overtimeRequest: {
      findFirst: jest.fn().mockResolvedValue(round),
      update: jest.fn((args: any) => ({ kind: 'round.update', args })),
    },
    $transaction: jest.fn(async (ops: any[]) => ops),
  };
  svc.userCanApproveOvertime = jest.fn().mockResolvedValue(true);
  svc.assertNotSelfOvertimeDecision = jest.fn().mockResolvedValue(undefined);
  svc.countedTime = {
    recomputeClosed: jest.fn().mockResolvedValue(undefined),
    toleranceFor: jest.fn().mockResolvedValue(10),
  };
  svc.notificationClient = { emit: jest.fn() };
  // Refusing lives in ExtraTimeDecisionService; it asks the same approval service who may decide.
  svc.rejectExtraTime = (data: any) => {
    const decisions = Object.assign(Object.create(ExtraTimeDecisionService.prototype), {
      rules: noOfficeRules(),
      prisma: svc.prisma,
      countedTime: svc.countedTime,
      notificationClient: svc.notificationClient,
      approval: svc,
    });
    return decisions.rejectExtraTime(data);
  };
  return svc;
}

const closedEntry = {
  id: 'e1',
  userId: 'member',
  locationId: 'space-1',
  organizationId: 'org-1',
  status: 'CLOCKED_OUT',
  clockInAt: at('08:00'),
  clockOutAt: at('18:40'),
  expectedClockOutAt: at('17:00'),
  breakMinutes: 30,
  shift: { graceMin: 10 },
};

describe('extra time decided after the clock-out arrived', () => {
  it('approves it, extends the expected end from the shift’s end, and recounts the paid time', async () => {
    const svc = service(closedEntry);
    await svc.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 90, organizationId: 'org-1' });

    const [entryUpdate] = svc.prisma.$transaction.mock.calls[0][0];
    // From 17:00, not from "now" — the work is over.
    expect(entryUpdate.args.data).toEqual({ expectedClockOutAt: at('18:30') });
    expect(svc.countedTime.recomputeClosed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', expectedClockOutAt: at('18:30') }),
    );
    expect(svc.notificationClient.emit).toHaveBeenCalledWith(
      'attendance_overtime_decision',
      expect.objectContaining({ decision: 'approved', minutes: 90 }),
    );
  });

  it('an open shift is approved as before — reminders re-armed, nothing recounted', async () => {
    const svc = service({
      ...closedEntry,
      status: 'CLOCKED_IN',
      clockOutAt: null,
      expectedClockOutAt: new Date(Date.now() + 3_600_000),
    });
    await svc.approveExtraTime({ approverId: 'leader', entryId: 'e1', minutes: 30, organizationId: 'org-1' });
    const [entryUpdate] = svc.prisma.$transaction.mock.calls[0][0];
    expect(entryUpdate.args.data).toEqual(expect.objectContaining({ reminderState: 'OVERTIME_APPROVED' }));
    expect(svc.countedTime.recomputeClosed).not.toHaveBeenCalled();
  });

  it('rejecting a closed shift’s request records the answer and nudges nobody', async () => {
    const svc = service({ id: 'e1', locationId: 'space-1', userId: 'member', status: 'CLOCKED_OUT' });
    await svc.rejectExtraTime({ approverId: 'leader', entryId: 'e1', organizationId: 'org-1', reason: 'Not needed' });
    const ops = svc.prisma.$transaction.mock.calls[0][0];
    // The "no" also settles the time after the end — it is not asked again as "outside the shift" (B1).
    expect(ops.map((o: any) => o.kind)).toEqual(['entry.outsideDecided', 'round.update']);
    expect(ops[0].args).toMatchObject({
      where: { id: 'e1', outsideDecidedAt: null },
      data: { outsideCountedMinutes: 0 },
    });
  });

  it('a refusal does not settle a day that ALSO started early — that part was never asked about', async () => {
    const svc = service({
      id: 'e1',
      locationId: 'space-1',
      userId: 'member',
      status: 'CLOCKED_OUT',
      clockInAt: at('06:00'),
      expectedClockInAt: at('07:00'),
    });
    await svc.rejectExtraTime({ approverId: 'leader', entryId: 'e1', organizationId: 'org-1' });
    const ops = svc.prisma.$transaction.mock.calls[0][0];
    expect(ops.map((o: any) => o.kind)).toEqual(['round.update']);
  });

  it('only a shift with an undecided request, closed within a week, may still be decided', () => {
    const now = at('19:30');
    const where = decidableExtraTimeWhere(now) as any;
    expect(where.OR[0]).toEqual({ status: 'CLOCKED_IN' });
    expect(where.OR[1]).toMatchObject({
      status: 'CLOCKED_OUT',
      overtimeRequests: { some: { status: 'PENDING_APPROVAL' } },
    });
    expect(where.OR[1].clockOutAt.gte.getTime()).toBe(now.getTime() - 7 * 24 * 3_600_000);
    // The leader's list needs a request actually waiting on an open shift.
    expect((decidableExtraTimeWhere(now, { openMustBePending: true }) as any).OR[0]).toEqual({
      status: 'CLOCKED_IN',
      reminderState: 'OVERTIME_PENDING',
    });
  });

  it('records when the member asked — never in the future, never before the shift', () => {
    const now = at('19:30');
    expect(respondedAt(at('17:05').toISOString(), at('08:00'), now)).toEqual(at('17:05'));
    expect(respondedAt(at('21:00').toISOString(), at('08:00'), now)).toEqual(now);
    expect(respondedAt(at('06:00').toISOString(), at('08:00'), now)).toEqual(at('08:00'));
    expect(respondedAt(null, at('08:00'), now)).toEqual(now);
    expect(respondedAt('not a date', at('08:00'), now)).toEqual(now);
  });
});
