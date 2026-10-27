/**
 * Office rules on overtime, on the two paths the audit of 2026-10-27 found open:
 *
 *  - a leader ADDING overtime to a finished shift wrote an approved round and never asked the rules;
 *  - time worked OUTSIDE the shift shared the extra-time step, and its second approver could count more
 *    minutes than the first agreed to.
 *
 * Both now go through `rules.decide`; the rule is judged on the shift's WHOLE overtime (59-minute rounds are
 * no way round a one-hour rule) and the minutes written are never above what any approver agreed to.
 */
import { ExtraTimeDecisionService } from '../extra-time/extra-time-decision.service';
import { OutsideShiftService } from '../extra-time/outside-shift.service';

const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00.000Z`);
const ENTRY = {
  id: 'e1',
  userId: 'worker',
  locationId: 's1',
  organizationId: 'o',
  status: 'CLOCKED_OUT',
  shiftId: null,
  clockInAt: at('08:00'),
  clockOutAt: at('18:00'),
  expectedClockInAt: at('08:00'),
  expectedClockOutAt: at('16:00'),
  endIsDailyLimit: false,
  outsideDecidedAt: null,
};
const waiting = { waiting: { stage: 'FIRST_STEP' as const, waitingFor: 'HR' } };

describe('adding overtime to a finished shift asks the office rules', () => {
  function build(decide: jest.Mock) {
    const svc = Object.create(ExtraTimeDecisionService.prototype) as any;
    svc.prisma = {
      timeEntry: { findFirst: jest.fn().mockResolvedValue({ ...ENTRY, overtimeRequests: [] }) },
      overtimeRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    svc.approval = {
      userCanApproveOvertime: jest.fn().mockResolvedValue(true),
      assertNotSelfOvertimeDecision: jest.fn().mockResolvedValue(undefined),
      approvedOvertimeMinutes: jest.fn().mockResolvedValue(120),
    };
    svc.rules = { decide };
    return svc;
  }

  it('past a rule it waits for the others — and nothing is written', async () => {
    const decide = jest.fn().mockResolvedValue(waiting);
    const svc = build(decide);
    const res = await svc.addOvertimeToClosedEntry({
      approverId: 'leader',
      entryId: 'e1',
      minutes: 300,
      organizationId: 'o',
    });
    expect(res.data).toEqual(expect.objectContaining({ stage: 'FIRST_STEP', waitingFor: 'HR' }));
    expect(svc.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is judged on the shift's whole overtime, and agrees to its own minutes", async () => {
    const decide = jest.fn().mockResolvedValue(waiting);
    await build(decide).addOvertimeToClosedEntry({
      approverId: 'leader',
      entryId: 'e1',
      minutes: 59,
      organizationId: 'o',
    });
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'overtime',
        itemId: 'e1',
        facts: { spaceIds: ['s1'], minutes: 179 },
        agreeMinutes: 59,
      }),
      expect.any(Function),
    );
  });
});

describe('time outside the shift is decided under its own step', () => {
  function build(decide: jest.Mock) {
    const svc = Object.create(OutsideShiftService.prototype) as any;
    svc.prisma = {
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue(ENTRY),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    svc.countedTime = { toleranceFor: jest.fn().mockResolvedValue(0), recomputeClosed: jest.fn() };
    svc.approval = {
      userCanApproveOvertime: jest.fn().mockResolvedValue(true),
      assertNotSelfOvertimeDecision: jest.fn().mockResolvedValue(undefined),
      // An hour already approved on the shift as an overtime round.
      approvedOvertimeMinutes: jest.fn().mockResolvedValue(60),
    };
    svc.decisions = { recordDecidedOvertime: jest.fn().mockResolvedValue(undefined) };
    svc.notificationClient = { emit: jest.fn() };
    svc.logger = { warn: jest.fn(), log: jest.fn() };
    svc.rules = { decide, clear: jest.fn() };
    return svc;
  }
  const decideFor = (minutes: number) => ({ approverId: 'leader', organizationId: 'o', entryId: 'e1', minutes });

  it('never the extra-time step on the same entry: approving one cannot finish or cancel the other', async () => {
    const decide = jest.fn().mockResolvedValue(waiting);
    await build(decide).decide(decideFor(120));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'overtime', itemId: 'e1:outside' }),
      expect.any(Function),
    );
  });

  it("judged with the shift's overtime already approved — a round plus outside time is no way round a rule", async () => {
    const decide = jest.fn().mockResolvedValue(waiting);
    await build(decide).decide(decideFor(120));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ facts: { spaceIds: ['s1'], minutes: 180 }, agreeMinutes: 120 }),
      expect.any(Function),
    );
  });

  it('the last approver cannot count more than an earlier one agreed to', async () => {
    // Step 1 agreed 30 minutes; the decision finishing it asks for all 120 — 30 are written.
    const decide = jest.fn(async (_input: unknown, write: (agreed?: number) => Promise<unknown>) => ({
      done: await write(30),
    }));
    const svc = build(decide);
    await svc.decide(decideFor(120));
    expect(svc.decisions.recordDecidedOvertime).toHaveBeenCalledWith(expect.objectContaining({ minutes: 30 }));
    expect(svc.prisma.timeEntry.updateMany.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ outsideCountedMinutes: 30 }),
    );
  });

  it('not counting drops its own step, never the extra-time one', async () => {
    const svc = build(jest.fn());
    await svc.decide(decideFor(0));
    expect(svc.rules.clear).toHaveBeenCalledWith('o', 'overtime', 'e1:outside');
  });
});
