/**
 * Time outside the planned shift — ONE decision per entry (docs/plans/time-counting-model.md, phase 3).
 *
 * Counting reuses the existing paths (the overtime round for after the end, the plan moved for
 * before the start); not counting writes only the decision; a decision is made once.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OutsideShiftService } from '../extra-time/outside-shift.service';

const at = (hm: string) => new Date(`2026-10-23T${hm}:00.000Z`);

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    organizationId: 'org',
    userId: 'mike',
    locationId: 'sp1',
    shiftId: 's1',
    status: 'CLOCKED_OUT',
    clockInAt: at('07:00'),
    clockOutAt: at('17:30'),
    expectedClockInAt: at('08:00'),
    expectedClockOutAt: at('16:00'),
    endIsDailyLimit: false,
    outsideDecidedAt: null,
    timezone: 'UTC',
    ...over,
  };
}

function make(opts: { row?: unknown; claimed?: number; gate?: unknown; mayApprove?: boolean; self?: boolean } = {}) {
  const updates: unknown[] = [];
  const prisma = {
    timeEntry: {
      findFirst: jest.fn().mockResolvedValue(opts.row === undefined ? entry() : opts.row),
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
      update: jest.fn((a) => (updates.push(a), a)),
    },
    shift: { findMany: jest.fn().mockResolvedValue([{ id: 's1', flagToleranceMin: 10 }]) },
    activityLog: { create: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([{ firstName: 'Anna', lastName: 'Müller' }]) },
  };
  const counted = { toleranceFor: jest.fn().mockResolvedValue(10), recomputeClosed: jest.fn() };
  const approval = {
    userCanApproveOvertime: jest.fn().mockResolvedValue(opts.mayApprove ?? true),
    assertNotSelfOvertimeDecision: jest.fn(async () => {
      if (opts.self) throw new ForbiddenException({ code: 'SELF_DECISION' });
    }),
  };
  const decisions = { addOvertimeToClosedEntry: jest.fn().mockResolvedValue({ success: true }) };
  const routing = { resolveWatchers: jest.fn().mockResolvedValue({ ids: ['anna'] }) };
  const rules = { gate: jest.fn().mockResolvedValue(opts.gate ?? { finalize: true }), clear: jest.fn() };
  const client = { emit: jest.fn() };
  const svc = new OutsideShiftService(
    prisma as never,
    client as never,
    counted as never,
    approval as never,
    decisions as never,
    routing as never,
    rules as never,
  );
  return { svc, prisma, counted, decisions, rules, updates };
}

const decide = (minutes: number) => ({ approverId: 'anna', organizationId: 'org', entryId: 'e1', minutes });

describe('deciding time outside the shift', () => {
  it('count all of it: the start moves to the clock-in, the end through the overtime round', async () => {
    const { svc, prisma, decisions, counted } = make();
    const r = (await svc.decide(decide(150))) as { data: { counted: number } };
    expect(r.data.counted).toBe(150);
    expect(prisma.timeEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { expectedClockInAt: at('07:00') },
    });
    expect(counted.recomputeClosed).toHaveBeenCalled();
    expect(decisions.addOvertimeToClosedEntry).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'e1', minutes: 90 }),
    );
    expect(prisma.timeEntry.updateMany.mock.calls[0][0].data).toMatchObject({
      outsideDecidedById: 'anna',
      outsideCountedMinutes: 150,
    });
  });

  it('count part of it: after the end first', async () => {
    const { svc, prisma, decisions } = make();
    await svc.decide(decide(60));
    expect(decisions.addOvertimeToClosedEntry).toHaveBeenCalledWith(expect.objectContaining({ minutes: 60 }));
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("don't count: only the decision is written, and a half-way office step is dropped", async () => {
    const { svc, decisions, rules, prisma } = make();
    const r = (await svc.decide(decide(0))) as { data: { counted: number } };
    expect(r.data.counted).toBe(0);
    expect(decisions.addOvertimeToClosedEntry).not.toHaveBeenCalled();
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    expect(rules.clear).toHaveBeenCalledWith('org', 'overtime', 'e1');
    expect(rules.gate).not.toHaveBeenCalled();
  });

  it('an office rule makes it step 1 of 2, and nothing is written', async () => {
    const { svc, prisma, decisions } = make({ gate: { finalize: false, roleName: 'HR' } });
    const r = (await svc.decide(decide(150))) as { data: { stage: string } };
    expect(r.data.stage).toBe('FIRST_STEP');
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
    expect(decisions.addOvertimeToClosedEntry).not.toHaveBeenCalled();
  });

  it('decided once: a second decision is refused', async () => {
    await expect(make({ row: entry({ outsideDecidedAt: new Date() }) }).svc.decide(decide(10))).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(make({ claimed: 0 }).svc.decide(decide(10))).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses what is not there to decide, outside reach, without the permission, or about yourself', async () => {
    await expect(
      make({ row: entry({ clockOutAt: at('16:05'), clockInAt: at('07:55') }) }).svc.decide(decide(10)),
    ).rejects.toMatchObject({ response: { code: 'OUTSIDE_NOTHING' } });
    await expect(make({ row: null }).svc.decide(decide(10))).rejects.toBeInstanceOf(NotFoundException);
    await expect(make({ mayApprove: false }).svc.decide(decide(10))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(make({ self: true }).svc.decide(decide(10))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('the lists', () => {
  it('lists only entries really outside the shift (past the tolerance)', async () => {
    const { svc, prisma } = make();
    prisma.timeEntry.findMany.mockResolvedValue([
      { ...entry(), user: { id: 'mike' }, location: { id: 'sp1', name: 'Site', timezone: 'UTC' } },
      {
        ...entry({ id: 'e2', clockInAt: at('07:55'), clockOutAt: at('16:05') }),
        user: { id: 'sarah' },
        location: null,
      },
    ]);
    const r = (await svc.listPending({ userId: 'anna', organizationId: 'org' })) as {
      data: Array<{ id: string; outside: unknown }>;
    };
    expect(r.data.map((x) => x.id)).toEqual(['e1']);
    expect(r.data[0]!.outside).toEqual({ before: 60, after: 90, total: 150 });
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({
      userId: { not: 'anna' },
      outsideDecidedAt: null,
      endIsDailyLimit: false,
    });
  });

  it("the member's own says how much waits, and for whom", async () => {
    const { svc, prisma } = make();
    prisma.timeEntry.findMany.mockResolvedValue([{ ...entry(), location: { name: 'Site', timezone: 'UTC' } }]);
    const r = (await svc.listMine({ userId: 'mike', organizationId: 'org' })) as {
      data: Array<Record<string, unknown>>;
    };
    expect(r.data[0]).toMatchObject({
      entryId: 'e1',
      date: '2026-10-23',
      total: 150,
      askedOf: { names: ['Anna Müller'], more: 0 },
    });
  });
});
