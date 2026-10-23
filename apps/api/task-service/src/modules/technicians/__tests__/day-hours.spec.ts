/**
 * The office sets ONE day's hours (docs/plans/time-counting-model.md, phase 2).
 *
 * The rule for an entry already recorded (reshapeForDayHours), the re-shape through the
 * same request rule a clock-in uses, and the guards on who may set whose day.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { reshapeForDayHours } from '../../attendance/shifts/day-hours-reshape';
import { DayHoursReshapeService } from '../../attendance/shifts/day-hours-reshape.service';
import { DayHoursService } from '../day-hours.service';

const at = (iso: string) => new Date(iso);
const MIN = 60_000;

describe('reshapeForDayHours — an entry already recorded', () => {
  const closed = {
    clockInAt: at('2026-10-24T08:00:00Z'),
    clockOutAt: at('2026-10-24T18:00:00Z'),
    expectedClockInAt: at('2026-10-24T08:00:00Z'),
    expectedClockOutAt: at('2026-10-24T16:00:00Z'),
    endIsDailyLimit: false,
    flagReasons: ['OVERTIME', 'OUTSIDE_GEOFENCE'],
  };

  it('a later end takes the overtime flag away and keeps flags about something else', () => {
    const r = reshapeForDayHours(
      closed,
      { start: null, end: at('2026-10-24T18:00:00Z') },
      10,
      at('2026-10-24T20:00:00Z'),
    );
    expect(r.endMoved).toBe(true);
    expect(r.startMoved).toBe(false);
    expect(r.expectedClockOutAt).toEqual(at('2026-10-24T18:00:00Z'));
    expect(r.flagReasons).toEqual(['OUTSIDE_GEOFENCE']);
    expect(r.reminder).toBeNull(); // closed: nothing to remind
  });

  it('an earlier end turns the extra time into overtime', () => {
    const r = reshapeForDayHours(
      closed,
      { start: null, end: at('2026-10-24T14:00:00Z') },
      10,
      at('2026-10-24T20:00:00Z'),
    );
    expect(r.flagReasons.sort()).toEqual(['OUTSIDE_GEOFENCE', 'OVERTIME']);
  });

  it('a later start judges the arrival again', () => {
    const late = { ...closed, clockInAt: at('2026-10-24T09:00:00Z'), flagReasons: ['LATE_ARRIVAL'] };
    const r = reshapeForDayHours(
      late,
      { start: at('2026-10-24T09:00:00Z'), end: null },
      10,
      at('2026-10-24T20:00:00Z'),
    );
    expect(r.startMoved).toBe(true);
    expect(r.flagReasons).toEqual([]);
  });

  it('the same hours change nothing', () => {
    const r = reshapeForDayHours(
      closed,
      { start: closed.expectedClockInAt, end: closed.expectedClockOutAt },
      10,
      new Date(),
    );
    expect(r.startMoved || r.endMoved).toBe(false);
  });

  it('an end set by the office is a real end: no longer a daily limit', () => {
    const limited = { ...closed, endIsDailyLimit: true, flagReasons: ['PAST_DAILY_LIMIT'] };
    const r = reshapeForDayHours(limited, { start: null, end: at('2026-10-24T17:00:00Z') }, 10, new Date());
    expect(r.endIsDailyLimit).toBe(false);
    expect(r.flagReasons).toEqual(['OVERTIME']);
  });

  it('a running entry re-arms the clock-out reminder from the new end', () => {
    const open = { ...closed, clockOutAt: null, flagReasons: [], reminderState: 'REMINDED' };
    const now = at('2026-10-24T16:30:00Z');
    const r = reshapeForDayHours(open, { start: null, end: at('2026-10-24T19:00:00Z') }, 10, now);
    expect(r.reminder?.reminderState).toBe('NONE');
    expect(r.reminder!.nextRemindAt.getTime()).toBeGreaterThan(at('2026-10-24T19:00:00Z').getTime());
  });

  it('extra time already asked for keeps its reminder state', () => {
    const open = { ...closed, clockOutAt: null, flagReasons: [], reminderState: 'OVERTIME_PENDING' };
    const r = reshapeForDayHours(open, { start: null, end: at('2026-10-24T19:00:00Z') }, 10, new Date());
    expect(r.reminder).toBeNull();
  });
});

describe('DayHoursReshapeService — through the same rule as a clock-in', () => {
  function entry(over: Record<string, unknown> = {}) {
    return {
      id: 'e1',
      organizationId: 'org',
      userId: 'u1',
      locationId: 'sp1',
      shiftId: 's1',
      timezone: 'Europe/Vienna',
      location: { timezone: 'Europe/Vienna' },
      clockInAt: at('2026-10-24T06:00:00Z'), // 08:00 Vienna
      clockOutAt: at('2026-10-24T16:00:00Z'), // 18:00 Vienna
      expectedClockInAt: at('2026-10-24T06:00:00Z'),
      expectedClockOutAt: at('2026-10-24T14:00:00Z'), // 16:00 Vienna
      endIsDailyLimit: false,
      flagReasons: ['OVERTIME'],
      approvalStatus: 'PENDING',
      approvalNotes: null,
      paidMinutes: 480,
      breakMinutes: 0,
      unpaidBreakMinutes: 0,
      labelRules: null,
      labelFacts: null,
      reminderState: 'RESOLVED',
      ...over,
    };
  }

  function make(rows: unknown[], overtime: unknown[] = []) {
    const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const prisma = {
      timeEntry: { findMany: jest.fn().mockResolvedValue(rows), update: jest.fn((a) => (updates.push(a), a)) },
      timeOff: { findMany: jest.fn().mockResolvedValue(overtime) },
      shift: { findUnique: jest.fn().mockResolvedValue({ graceMin: 10 }) },
      activityLog: { create: jest.fn() },
    };
    const counted = {
      toleranceFor: jest.fn().mockResolvedValue(10),
      columnsFor: jest.fn(async (e: { expectedClockOutAt: Date; clockInAt: Date }, out: Date) => ({
        countedStartAt: e.clockInAt,
        countedEndAt: new Date(Math.min(out.getTime(), e.expectedClockOutAt.getTime())),
        paidMinutes: Math.round(
          (Math.min(out.getTime(), e.expectedClockOutAt.getTime()) - e.clockInAt.getTime()) / MIN,
        ),
      })),
    };
    const client = { emit: jest.fn() };
    const svc = new DayHoursReshapeService(prisma as never, counted as never, client as never);
    return { svc, prisma, updates, client };
  }

  const request = (endTime: string | null, startTime: string | null = null) => ({
    id: 't1',
    kind: 'HOURS',
    spaceId: 'sp1',
    startTime,
    endTime,
    minutes: null,
    startDate: at('2026-10-24T00:00:00Z'),
    endDate: at('2026-10-24T00:00:00Z'),
  });

  const change = (req: ReturnType<typeof request>) => ({
    organizationId: 'org',
    userId: 'u1',
    date: '2026-10-24',
    spaceId: 'sp1',
    request: req,
    actorId: 'leader',
    reason: 'stocktake',
  });

  it('a later end counts the stay, clears the overtime flag and leaves nothing to decide', async () => {
    const { svc, updates, client } = make([entry()]);
    expect(await svc.reshapeDay(change(request('18:00')))).toBe(1);
    const data = updates[0].data;
    expect(data.expectedClockOutAt).toEqual(at('2026-10-24T16:00:00Z'));
    expect(data.paidMinutes).toBe(600);
    expect(data.flagReasons).toEqual([]);
    expect(data.approvalStatus).toBe('AUTO');
    expect(client.emit).toHaveBeenCalled();
  });

  it('a decided entry keeps its decision and says what moved', async () => {
    const { svc, updates } = make([entry({ approvalStatus: 'APPROVED' })]);
    await svc.reshapeDay(change(request('18:00')));
    expect(updates[0].data.approvalStatus).toBeUndefined();
    expect(String(updates[0].data.approvalNotes)).toContain('8h 00m → 10h 00m');
  });

  it('agreed overtime still extends a replaced end', async () => {
    const ot = [
      {
        id: 'o1',
        kind: 'OVERTIME',
        spaceId: 'sp1',
        minutes: 30,
        startTime: null,
        endTime: null,
        startDate: at('2026-10-24T00:00:00Z'),
        endDate: at('2026-10-24T00:00:00Z'),
      },
    ];
    const { svc, updates } = make([entry()], ot);
    await svc.reshapeDay(change(request('17:00')));
    expect(updates[0].data.expectedClockOutAt).toEqual(at('2026-10-24T15:30:00Z')); // 17:30 Vienna
  });

  it('a night set by the office ends the next morning, and counts to it', async () => {
    const night = entry({
      clockInAt: at('2026-10-24T16:00:00Z'), // 18:00 Vienna
      clockOutAt: at('2026-10-25T05:00:00Z'), // 06:00 Vienna, next morning
      expectedClockInAt: null,
      expectedClockOutAt: null,
      shiftId: null,
      flagReasons: [],
    });
    const { svc, updates } = make([night]);
    await svc.reshapeDay(change(request('06:00', '18:00')));
    expect(updates[0].data.expectedClockInAt).toEqual(at('2026-10-24T16:00:00Z'));
    expect(updates[0].data.expectedClockOutAt).toEqual(at('2026-10-25T05:00:00Z'));
    expect(updates[0].data.paidMinutes).toBe(780);
  });

  it('an entry of another local day is left alone', async () => {
    const { svc, updates } = make([entry({ clockInAt: at('2026-10-24T22:30:00Z') })]); // 00:30 on the 25th, Vienna
    expect(await svc.reshapeDay(change(request('18:00')))).toBe(0);
    expect(updates).toHaveLength(0);
  });
});

describe('DayHoursService — who may set whose day', () => {
  function make(
    opts: { member?: boolean; assigned?: boolean; rostered?: boolean; leave?: unknown[]; previous?: unknown } = {},
  ) {
    const prisma = {
      user: {
        findFirst: jest.fn(async (a: { where: { role?: string } }) =>
          a.where.role ? null : opts.member === false ? null : { id: 'u1' },
        ),
      },
      spaceAssignment: {
        findFirst: jest.fn(async (a: { where: { spaceId: unknown } }) =>
          typeof a.where.spaceId === 'object'
            ? opts.rostered === false
              ? null
              : { id: 'a' }
            : opts.assigned === false
              ? null
              : { id: 'a' },
        ),
      },
      timeOff: {
        findMany: jest.fn().mockResolvedValue(opts.leave ?? []),
        findFirst: jest.fn().mockResolvedValue(opts.previous ?? null),
        create: jest.fn(async (a: { data: Record<string, unknown> }) => ({
          id: 't1',
          approvedBy: { firstName: 'Anna', lastName: 'M' },
          space: { name: 'Site' },
          ...a.data,
        })),
        update: jest.fn(async (a: { data: Record<string, unknown> }) => ({
          id: 'prev',
          approvedBy: null,
          space: null,
          startDate: at('2026-10-24'),
          endDate: at('2026-10-24'),
          ...a.data,
        })),
      },
    };
    const reshape = { reshapeDay: jest.fn().mockResolvedValue(1) };
    const client = { emit: jest.fn() };
    return { svc: new DayHoursService(prisma as never, reshape as never, client as never), prisma, reshape, client };
  }
  const input = (over: Record<string, unknown> = {}) => ({
    editorId: 'leader',
    organizationId: 'org',
    technicianId: 'u1',
    date: '2026-10-24',
    spaceId: 'sp1',
    startTime: '08:00',
    endTime: '18:00',
    ...over,
  });

  it('writes an APPROVED changed-hours request, re-shapes the day and tells the member who set it', async () => {
    const { svc, prisma, reshape, client } = make();
    const res = (await svc.setDayHours(input())) as { data: { entriesChanged: number } };
    expect(prisma.timeOff.create.mock.calls[0][0].data).toMatchObject({
      kind: 'HOURS',
      status: 'APPROVED',
      approvedById: 'leader',
    });
    expect(reshape.reshapeDay).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-24', spaceId: 'sp1' }));
    expect(res.data.entriesChanged).toBe(1);
    expect(client.emit.mock.calls[0][1]).toMatchObject({ approved: true, setBy: 'Anna M', memberId: 'u1' });
  });

  it('setting the day again replaces the earlier hours — one answer per day', async () => {
    const { svc, prisma } = make({
      previous: { id: 'prev', startDate: at('2026-10-24'), endDate: at('2026-10-24'), status: 'PENDING' },
    });
    await svc.setDayHours(input({ endTime: '17:00' }));
    expect(prisma.timeOff.create).not.toHaveBeenCalled();
    expect(prisma.timeOff.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'prev' },
      data: { endTime: '17:00', status: 'APPROVED' },
    });
  });

  it('refuses a day inside a longer changed-hours request', async () => {
    const { svc } = make({
      previous: { id: 'p', startDate: at('2026-10-20'), endDate: at('2026-10-30'), status: 'APPROVED' },
    });
    await expect(svc.setDayHours(input())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a day of leave', async () => {
    const { svc } = make({
      leave: [{ kind: 'LEAVE', startDate: at('2026-10-24'), endDate: at('2026-10-24'), status: 'APPROVED' }],
    });
    await expect(svc.setDayHours(input())).rejects.toMatchObject({ response: { code: 'REQUEST_OVERLAPS_LEAVE' } });
  });

  it('a workspace leader sets hours only in a workspace they lead — never "everywhere"', async () => {
    await expect(make().svc.setDayHours(input({ scopeSpaceIds: ['other'] }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(make().svc.setDayHours(input({ scopeSpaceIds: ['sp1'], spaceId: null }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(make().svc.setDayHours(input({ scopeSpaceIds: ['sp1'] }))).resolves.toBeTruthy();
  });

  it('refuses a workspace the member does not work in, and your own day', async () => {
    await expect(make({ assigned: false }).svc.setDayHours(input())).rejects.toMatchObject({
      response: { code: 'REQUEST_SPACE_NOT_YOURS' },
    });
    await expect(make().svc.setDayHours(input({ editorId: 'u1' }))).rejects.toMatchObject({
      response: { code: 'SELF_DECISION' },
    });
  });

  it('takes a night, and refuses times the member could not ask for either (the shared parser)', async () => {
    await expect(make().svc.setDayHours(input({ startTime: '18:00', endTime: '06:00' }))).resolves.toBeTruthy();
    await expect(make().svc.setDayHours(input({ startTime: '14:00', endTime: '09:00' }))).rejects.toMatchObject({
      response: { code: 'REQUEST_TIME_INVALID' },
    });
  });
});
