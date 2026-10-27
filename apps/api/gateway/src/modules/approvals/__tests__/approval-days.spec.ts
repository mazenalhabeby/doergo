/**
 * A person's working day as ONE inbox item (packages/shared/src/approvals/approval-days.ts)
 * and "Approve day" (ApprovalDaysService): it groups, and it replays each member
 * through the inbox's own decide — never deciding anything itself.
 */
import { approvalDays, toApproval, type ApprovalContext } from '@hbcfield/shared';
import { ApprovalDaysService } from '../approval-days.service';
import type { ApprovalsService } from '../approvals.service';

const now = new Date('2026-10-16T18:00:00Z');
const ctx = (decide = true): ApprovalContext => ({ now, me: 'boss', mayDecide: () => decide });
const mike = { id: 'u-mike', firstName: 'Mike', lastName: 'Weber' };
const space = { id: 's1', name: 'Warehouse', timezone: 'Europe/Vienna' };

const hours = (id: string, clockInAt: string, flags: string[]) =>
  toApproval.hours(
    {
      id,
      user: mike,
      location: space,
      clockInAt,
      clockOutAt: clockInAt,
      flagReasons: flags,
      timezone: 'Europe/Vienna',
    },
    ctx(),
  );
const extra = (id: string, clockInAt: string) =>
  toApproval.extraTime({ id, user: mike, location: space, clockInAt, status: 'CLOCKED_OUT' }, ctx());

describe('a working day in the inbox', () => {
  it('two or more time items of one person on one local day become one day', () => {
    const items = [
      hours('e1', '2026-10-16T06:02:00Z', ['LATE_ARRIVAL', 'RECORDED_OFFLINE']),
      extra('e1', '2026-10-16T06:02:00Z'),
    ];
    const [day] = approvalDays(items);
    expect(day).toMatchObject({
      key: 'day:u-mike:2026-10-16',
      localDate: '2026-10-16',
      kinds: ['extraTime'],
      canDecide: true,
    });
    expect(day!.labels).toEqual(['LATE_ARRIVAL']); // review labels only, from the catalogue
    expect(day!.members).toHaveLength(2);
    // Extra time needs minutes, so "Approve day" decides only the hours.
    expect(day!.approvable).toEqual([{ kind: 'hours', id: 'e1' }]);
  });

  it('one item stays itself, and days are split by the workspace’s local day', () => {
    expect(approvalDays([hours('e1', '2026-10-16T06:00:00Z', ['LATE_ARRIVAL'])])).toEqual([]);
    // 23:30 UTC on the 15th is the 16th in Vienna — same day as the morning entry.
    const items = [hours('a', '2026-10-15T23:30:00Z', []), hours('b', '2026-10-16T12:00:00Z', ['MISSED_BREAK'])];
    expect(approvalDays(items)).toHaveLength(1);
  });

  it('a day the caller may only partly decide approves only their part', () => {
    const mine = hours('a', '2026-10-16T06:00:00Z', []);
    const notMine = { ...hours('b', '2026-10-16T12:00:00Z', []), canDecide: false };
    const [day] = approvalDays([mine, notMine]);
    expect(day!.canDecide).toBe(false);
    expect(day!.approvable).toEqual([{ kind: 'hours', id: 'a' }]);
  });
});

describe('Approve day', () => {
  const inbox = (
    decide: (kind: string, id: string) => { ok: boolean; code?: string; stage?: string; waitingFor?: string },
  ) => {
    const item = jest.fn(async (_c: unknown, kind: string, id: string) =>
      id === 'gone' ? null : { kind, id, canDecide: id !== 'ro' },
    );
    const decideFn = jest.fn(async (_c: unknown, d: { kind: string; id: string }) => ({
      status: 200,
      ...decide(d.kind, d.id),
    }));
    return { svc: new ApprovalDaysService({ item, decide: decideFn } as unknown as ApprovalsService), item, decideFn };
  };
  const caller = { user: { id: 'boss' }, headers: {} } as never;

  it('decides every member through the inbox’s own decide, in order', async () => {
    const { svc, decideFn } = inbox(() => ({ ok: true }));
    const r = await svc.approveDay(caller, [
      { kind: 'hours', id: 'a' },
      { kind: 'away', id: 'x' },
    ]);
    expect(r).toEqual({
      complete: true,
      results: [
        { kind: 'hours', id: 'a', ok: true },
        { kind: 'away', id: 'x', ok: true },
      ],
    });
    expect(decideFn.mock.calls.map((c) => c[1])).toEqual([
      { kind: 'hours', id: 'a', action: 'approve' },
      { kind: 'away', id: 'x', action: 'approve' },
    ]);
  });

  /*
    ⚠️ An office rule may want a second person on one member: the caller's approval went through, but the day
    is not done — it must never read "Day approved" while an item still waits.
  */
  it('a member held for another approval is approved by them, and the day is not complete', async () => {
    const { svc } = inbox((_k, id) =>
      id === 'b' ? { ok: true, stage: 'FIRST_STEP', waitingFor: 'HR' } : { ok: true },
    );
    const r = await svc.approveDay(caller, [
      { kind: 'hours', id: 'a' },
      { kind: 'hours', id: 'b' },
    ]);
    expect(r).toEqual({
      complete: false,
      results: [
        { kind: 'hours', id: 'a', ok: true },
        { kind: 'hours', id: 'b', ok: true, waitingFor: 'HR' },
      ],
    });
  });

  it('stops at the first refusal and says which', async () => {
    const { svc, decideFn } = inbox((_k, id) =>
      id === 'b' ? { ok: false, code: 'SECOND_STEP_REQUIRED' } : { ok: true },
    );
    const r = await svc.approveDay(caller, [
      { kind: 'hours', id: 'a' },
      { kind: 'hours', id: 'b' },
      { kind: 'hours', id: 'c' },
    ]);
    expect(r.complete).toBe(false);
    expect(r.results.at(-1)).toMatchObject({ id: 'b', ok: false, code: 'SECOND_STEP_REQUIRED' });
    expect(decideFn).toHaveBeenCalledTimes(2);
  });

  it('never sends what is not in the caller’s inbox, read-only, or needs minutes', async () => {
    for (const [m, code] of [
      [{ kind: 'hours', id: 'gone' }, 'APPROVAL_NOT_IN_INBOX'],
      [{ kind: 'hours', id: 'ro' }, 'APPROVAL_NOT_IN_INBOX'],
      [{ kind: 'extraTime', id: 'e' }, 'APPROVAL_DAY_NEEDS_REVIEW'],
    ] as const) {
      const { svc, decideFn } = inbox(() => ({ ok: true }));
      const r = await svc.approveDay(caller, [m]);
      expect(r).toMatchObject({ complete: false, results: [{ ok: false, code }] });
      expect(decideFn).not.toHaveBeenCalled();
    }
  });
});
