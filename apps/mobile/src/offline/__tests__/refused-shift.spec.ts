/**
 * A clock-in the phone showed as done and the server refused afterwards —
 * found, and said in words the member can act on.
 */
import { refusedShiftCopy, refusedShiftOps, refusedSpaceId } from '../attendance/refused-shift';
import type { OutboxOp } from '../outbox/types';

const t = (key: string, opts: Record<string, unknown> = {}) =>
  String(opts.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ''));
const fmt = { clock: (d: Date) => d.toISOString().slice(11, 16), date: (d: Date) => d.toISOString().slice(0, 10) };

const op = (over: Partial<OutboxOp>): OutboxOp => ({
  id: 'op-1', userId: 'u', organizationId: 'o', op: 'attendance.clockIn', lane: 'shift:e', dependsOn: [],
  payload: { body: { id: 'e', locationId: 'loc-agru' } } as never,
  evidence: { occurredAt: '2026-10-01T13:10:20.000Z' } as never,
  state: 'failed', attempts: 1, createdAt: 1, updatedAt: 1, ...over,
});

describe('refusedShiftOps', () => {
  it('keeps refused shift actions only, newest first', () => {
    const ops = [
      op({ id: 'a', createdAt: 1 }),
      op({ id: 'b', createdAt: 3, op: 'attendance.clockOut' }),
      op({ id: 'c', createdAt: 2, state: 'done' }),
      op({ id: 'd', createdAt: 4, op: 'task.status' as never }),
      op({ id: 'e', createdAt: 5, state: 'retry' }),
    ];
    expect(refusedShiftOps(ops).map((o) => o.id)).toEqual(['b', 'a']);
  });
});

describe('refusedShiftCopy', () => {
  it('names the later shift an out-of-order clock-in ran into', () => {
    const copy = refusedShiftCopy(t, op({ lastError: { code: 'OUT_OF_ORDER', params: { previousAt: '2026-10-05T20:00:00.000Z' } } }), fmt);
    expect(copy.title).toBe("Your clock-in at 13:10 wasn't saved");
    expect(copy.reason).toContain('(2026-10-05)');
    expect(copy.canClockInNow).toBe(true);
    expect(copy.issueBody).toContain('2026-10-01');
  });

  it('explains a clock-out refused because its clock-in never arrived', () => {
    const copy = refusedShiftCopy(t, op({ op: 'attendance.clockOut', lastError: { code: 'DEPENDENCY_FAILED' } }), fmt);
    expect(copy.reason).toMatch(/nothing to clock out of/);
    expect(copy.canClockInNow).toBe(false);
  });

  it("falls back to the server's own words for a code it does not know", () => {
    const copy = refusedShiftCopy(t, op({ lastError: { code: 'SOMETHING_NEW', message: 'Workspace is closed' } }), fmt);
    expect(copy.reason).toBe('Workspace is closed');
  });

  it('carries the workspace the clock-in named', () => {
    expect(refusedSpaceId(op({}))).toBe('loc-agru');
  });
});
