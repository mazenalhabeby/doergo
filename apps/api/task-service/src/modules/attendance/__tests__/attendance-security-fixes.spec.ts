import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { clampListLimit, clampListPage } from '@hbcfield/shared';
import { ApprovalService } from '../approval.service';
// AttendanceService hands the entry reads to AttendanceReadService, where they live.
import { AttendanceReadService } from '../attendance-read.service';
import { readAttendanceServiceSource } from './attendance-service-source';
import { BreakService } from '../break.service';
import { BreakRulesService } from '../break-rules.service';
import { BreakReminderService } from '../break-reminder.service';
import { CountedTimeService } from '../counted-time.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TechniciansService } from '../../technicians/technicians.service';
import { AssetExpenseService } from '../../assets/asset-expense.service';
import { clockEventEntry } from '../clock-event';

/**
 * Regressions for one batch of attendance authorization and correctness fixes.
 * Each block names what the code did before, which is what the test refuses.
 */

const ORG = 'org-1';

// ── #12 Every list limit is bounded ─────────────────────────────────────────
describe('list limits', () => {
  it('clamps a hostile or broken limit', () => {
    expect(clampListLimit(1_000_000, 20)).toBe(200);
    expect(clampListLimit('abc', 20)).toBe(20);
    expect(clampListLimit(undefined, 50)).toBe(50);
    expect(clampListLimit(0, 50)).toBe(1);
    expect(clampListLimit(-5, 50)).toBe(1);
    expect(clampListPage('x')).toBe(1);
    expect(clampListPage(3)).toBe(3);
  });

  it('the approvals queue takes at most 200 rows, whatever is asked', async () => {
    const svc = Object.create(ApprovalService.prototype) as any;
    svc.prisma = { timeEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    await svc.getPendingApprovals({ organizationId: ORG, limit: 1_000_000, page: Number.NaN });
    const q = svc.prisma.timeEntry.findMany.mock.calls[0][0];
    expect(q.take).toBe(200);
    expect(q.skip).toBe(0);
  });
});

// ── #9 The org room hears THAT somebody clocked in, not where ───────────────
describe('clock-in/out broadcast', () => {
  const row = {
    id: 'e1', userId: 'u1', status: 'CLOCKED_IN', locationId: 's1', isRemote: true,
    clockInAt: new Date('2026-10-01T06:00:00Z'), clockOutAt: null,
    clockInLat: 48.2, clockInLng: 16.37, clockInAccuracy: 5, clockInPlace: 'Hauptstraße 1, Wien',
    awayReason: 'Doctor', notes: 'private', flagReasons: ['LATE'], breakPlan: [],
    location: { name: 'Main Office', lat: 1, lng: 2 }, user: { firstName: 'A', lastName: 'B', email: 'a@b.c' },
  };

  it('carries no coordinates, reasons, notes or flags', () => {
    const out = clockEventEntry(row as any, 'in') as unknown as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(
      ['at', 'entryId', 'id', 'isRemote', 'location', 'locationId', 'status', 'user', 'userId'].sort(),
    );
    expect(JSON.stringify(out)).not.toMatch(/48\.2|16\.37|Doctor|private|Hauptstra|LATE|a@b\.c/);
    expect(out.location).toEqual({ name: 'Main Office' });
    expect(out.at).toBe('2026-10-01T06:00:00.000Z');
  });

  it('every clock emit goes through the projector — never the raw row', () => {
    const src = readAttendanceServiceSource();
    const emits = src.match(/emit\('attendance_clock_(in|out)',\s*\{[\s\S]*?\}\);/g) ?? [];
    // Every close goes through ClockOutService.closeEntry, so the clock-out emit is ONE place.
    expect(emits.length).toBeGreaterThanOrEqual(3);
    for (const e of emits) expect(e).toMatch(/timeEntry: clockEventEntry\(/);
  });
});

// ── #6 Break rules are configured only where the caller manages ─────────────
describe('break-rule writes are narrowed to the rule\'s workspace', () => {
  const prisma: any = {
    breakRule: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({ id: 'r1' }), create: jest.fn().mockResolvedValue({ id: 'r1', name: 'Rest' }) },
    shift: { findFirst: jest.fn() },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'space-b' }) },
  };
  const svc = new BreakRulesService(prisma);
  const rule = { id: 'r1', organizationId: ORG, spaceId: 'space-b', shiftId: null, trigger: 'AFTER_WORKED', afterMinutes: 240, durationMinutes: 30 };
  beforeEach(() => jest.clearAllMocks());

  it('a manager of A cannot change, remove or add a rest in B', async () => {
    prisma.breakRule.findFirst.mockResolvedValue(rule);
    await expect(svc.update({ id: 'r1', organizationId: ORG, scopeSpaceIds: ['space-a'] } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove({ id: 'r1', organizationId: ORG, scopeSpaceIds: ['space-a'] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.create({ organizationId: ORG, spaceId: 'space-b', trigger: 'AFTER_WORKED', afterMinutes: 60, scopeSpaceIds: ['space-a'] } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.breakRule.update).not.toHaveBeenCalled();
    expect(prisma.breakRule.create).not.toHaveBeenCalled();
  });

  it('a rule on an org-wide shift needs an org-wide grant', async () => {
    prisma.breakRule.findFirst.mockResolvedValue({ ...rule, spaceId: null, shiftId: 'sh1' });
    prisma.shift.findFirst.mockResolvedValue({ spaceId: null });
    await expect(svc.remove({ id: 'r1', organizationId: ORG, scopeSpaceIds: ['space-a'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('org-wide (null) and the right workspace still work', async () => {
    prisma.breakRule.findFirst.mockResolvedValue(rule);
    await svc.update({ id: 'r1', organizationId: ORG, scopeSpaceIds: null, durationMinutes: 20 } as any);
    await svc.remove({ id: 'r1', organizationId: ORG, scopeSpaceIds: ['space-b'] });
    expect(prisma.breakRule.update).toHaveBeenCalledTimes(2);
  });
});

// ── #8 A workspace's entries need the attendance permission there ───────────
describe('GET /attendance/locations/:id/entries', () => {
  function svcWith(activeAssignment: boolean) {
    const svc = Object.create(AttendanceReadService.prototype) as any;
    svc.prisma = {
      companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'space-b' }) },
      spaceAssignment: { findFirst: jest.fn().mockResolvedValue(activeAssignment ? { id: 'sa' } : null) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    return svc;
  }

  it('being on the roster without the permission reads nothing (it used to read everything)', async () => {
    const svc = svcWith(true);
    await expect(
      svc.getLocationEntries({ locationId: 'space-b', organizationId: ORG, requesterId: 'u', viewScopeSpaceIds: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(svc.prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it('the permission in the space counts only through an assignment active now', async () => {
    const ended = svcWith(false);
    await expect(
      ended.getLocationEntries({ locationId: 'space-b', organizationId: ORG, requesterId: 'u', viewScopeSpaceIds: ['space-b'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const where = ended.prisma.spaceAssignment.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: expect.any(Date) } }]);
    expect(where.effectiveFrom).toEqual({ lte: expect.any(Date) });

    const supervisor = svcWith(true); // an External Supervisor holds exactly this
    await supervisor.getLocationEntries({ locationId: 'space-b', organizationId: ORG, requesterId: 'u', viewScopeSpaceIds: ['space-b'] });
    expect(supervisor.prisma.timeEntry.findMany).toHaveBeenCalled();
  });

  it('org-wide reads without an assignment', async () => {
    const svc = svcWith(false);
    await svc.getLocationEntries({ locationId: 'space-b', organizationId: ORG, requesterId: 'u', viewScopeSpaceIds: null });
    expect(svc.prisma.spaceAssignment.findFirst).not.toHaveBeenCalled();
    expect(svc.prisma.timeEntry.findMany).toHaveBeenCalled();
  });
});

// ── The dashboard batch follows the SAME rule as the single workspace read ──
describe('GET /attendance/entries (batch)', () => {
  function svcWith(activeIn: string[]) {
    const svc = Object.create(AttendanceReadService.prototype) as any;
    svc.prisma = {
      companyLocation: { findMany: jest.fn(({ where }: any) => Promise.resolve(where.id.in.map((id: string) => ({ id })))) },
      spaceAssignment: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(where.spaceId.in.filter((id: string) => activeIn.includes(id)).map((spaceId: string) => ({ spaceId })))),
      },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return svc;
  }
  const readIds = (svc: any) => svc.prisma.timeEntry.findMany.mock.calls[0]?.[0].where.locationId.in;

  it('on the roster without the permission (External Observer) reads nothing', async () => {
    const svc = svcWith(['space-a', 'space-b']);
    const res = await svc.getLocationEntriesBatch({ locationIds: ['space-a', 'space-b'], organizationId: ORG, requesterId: 'u', viewScopeSpaceIds: [] });
    expect(res.data).toEqual([]);
    expect(svc.prisma.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it('the permission in a space counts only there, and only through an assignment active now', async () => {
    const svc = svcWith(['space-a']); // assigned to B too, but that assignment has ended
    await svc.getLocationEntriesBatch({ locationIds: ['space-a', 'space-b', 'space-c'], organizationId: ORG, requesterId: 'u', viewScopeSpaceIds: ['space-a', 'space-b'] });
    expect(readIds(svc)).toEqual(['space-a']);
    const where = svc.prisma.spaceAssignment.findMany.mock.calls[0][0].where;
    expect(where.spaceId).toEqual({ in: ['space-a', 'space-b'] });
    expect(where.effectiveFrom).toEqual({ lte: expect.any(Date) });
  });

  it('org-wide reads every requested workspace without an assignment', async () => {
    const svc = svcWith([]);
    await svc.getLocationEntriesBatch({ locationIds: ['space-a', 'space-b'], organizationId: ORG, requesterId: 'u', viewScopeSpaceIds: null });
    expect(svc.prisma.spaceAssignment.findMany).not.toHaveBeenCalled();
    expect(readIds(svc)).toEqual(['space-a', 'space-b']);
  });
});

// ── #14 An entry's breaks: your own, or a space you may read ────────────────
describe('GET /attendance/entries/:id/breaks', () => {
  let service: BreakService;
  const prisma: any = { timeEntry: { findFirst: jest.fn().mockResolvedValue(null) }, break: { findMany: jest.fn() } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakReminderService, BreakRulesService, CountedTimeService, BreakService,
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BreakService);
  });

  it('asks for the caller\'s own entry OR one in their attendance spaces', async () => {
    await expect(
      service.getBreaksForEntry({ timeEntryId: 'e1', organizationId: ORG, requesterId: 'me', scopeSpaceIds: ['space-a'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const where = prisma.timeEntry.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ userId: 'me' }, { locationId: { in: ['space-a'] } }]);
    expect(prisma.break.findMany).not.toHaveBeenCalled();
  });
});

// ── #13 Nobody decides their own item (the overtime rule) ───────────────────
describe('self-decisions', () => {
  const notAdmin = { findFirst: jest.fn().mockResolvedValue(null) };

  function approval(entry: Record<string, unknown>) {
    const svc = Object.create(ApprovalService.prototype) as any;
    svc.prisma = {
      user: notAdmin,
      timeEntry: { findFirst: jest.fn().mockResolvedValue(entry), update: jest.fn().mockResolvedValue(entry) },
      companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 's1', timezone: 'UTC' }) },
    };
    svc.notificationClient = { emit: jest.fn() };
    return svc;
  }
  const own = { id: 'e1', userId: 'lead', approvalStatus: 'PENDING', isEdited: false };

  it('a shift leader cannot approve, reject or edit their own entry', async () => {
    const svc = approval(own);
    await expect(svc.approveEntry({ entryId: 'e1', approverId: 'lead', organizationId: ORG })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.rejectEntry({ entryId: 'e1', approverId: 'lead', organizationId: ORG, reason: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.editEntry({ entryId: 'e1', editorId: 'lead', organizationId: ORG, reason: 'x', clockInAt: '2026-10-01T05:00:00Z' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it('nor add hours to their own record', async () => {
    const svc = approval(own);
    svc.prisma.user = { findFirst: jest.fn().mockResolvedValueOnce({ id: 'lead' }).mockResolvedValueOnce(null) };
    await expect(
      svc.addManualEntries({ editorId: 'lead', userId: 'lead', organizationId: ORG, locationId: 's1', startDate: '2026-09-01', endDate: '2026-09-01', startTime: '08:00', endTime: '16:00' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the org owner (ADMIN) still may — nobody is above them', async () => {
    const svc = approval(own);
    svc.prisma.user = { findFirst: jest.fn().mockResolvedValue({ id: 'lead' }) };
    jest.spyOn(svc, 'emitChanged').mockImplementation(() => undefined);
    svc.logger = { log: jest.fn(), warn: jest.fn() };
    await expect(svc.approveEntry({ entryId: 'e1', approverId: 'lead', organizationId: ORG })).resolves.toBeDefined();
  });

  it('bulk approval passes the scope through (it spread a where-fragment before, i.e. org-wide)', async () => {
    const svc = Object.create(ApprovalService.prototype) as any;
    svc.approveEntry = jest.fn().mockResolvedValue({});
    svc.emitChanged = jest.fn();
    await svc.bulkApprove({ entryIds: ['e1'], approverId: 'm', organizationId: ORG, scopeSpaceIds: ['space-a'] });
    expect(svc.approveEntry.mock.calls[0][0].scopeSpaceIds).toEqual(['space-a']);
    expect(svc.approveEntry.mock.calls[0][0]).not.toHaveProperty('locationId');
  });

  it('nobody decides their own leave', async () => {
    const svc = Object.create(TechniciansService.prototype) as any;
    svc.prisma = {
      user: notAdmin,
      timeOff: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1', technicianId: 'lead', status: 'PENDING', startDate: new Date(), endDate: new Date(),
          technician: { organizationId: ORG, spaceAssignments: [{ spaceId: 'space-a' }] },
        }),
        update: jest.fn(),
      },
    };
    await expect(
      svc.approveTimeOff({ timeOffId: 't1', organizationId: ORG, approverId: 'lead', approved: true, scopeSpaceIds: ['space-a'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.prisma.timeOff.update).not.toHaveBeenCalled();
  });

  it('nobody accepts their own expense', async () => {
    const svc = Object.create(AssetExpenseService.prototype) as any;
    // A manager of the record's workspace — the self-decision rule is what is under test.
    svc.access = { assertMay: jest.fn(), mayIn: () => true };
    svc.notifier = { expenseDecided: jest.fn() };
    svc.prisma = {
      user: notAdmin,
      assetMoney: { findFirst: jest.fn().mockResolvedValue({ authorId: 'mgr' }), updateMany: jest.fn() },
    };
    await expect(
      svc.review({ entryId: 'm1', decision: 'accept', userId: 'mgr', userRole: 'EMPLOYEE', organizationId: ORG }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.prisma.assetMoney.updateMany).not.toHaveBeenCalled();
  });
});

// ── #15 Wall time on a daylight-saving day ──────────────────────────────────
describe('a back-filled shift on a DST change day', () => {
  let service: ApprovalService;
  const created: any[] = [];
  const tx = {
    timeEntry: {
      create: jest.fn(async ({ data }: any) => { created.push(data); return { id: `te-${created.length}`, ...data }; }),
      createMany: jest.fn(async ({ data }: any) => { created.push(...data); return { count: data.length }; }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    break: { create: jest.fn() },
  };
  const prisma: any = {
    ...tx,
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 'sp', lat: 1, lng: 2, timezone: 'Europe/Vienna' }) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  beforeEach(async () => {
    created.length = 0;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakReminderService, BreakRulesService, CountedTimeService, ApprovalService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(ApprovalService);
  });

  const add = (day: string, start: string, end: string) =>
    (service as any).addManualEntries({
      userId: 'u1', organizationId: ORG, editorId: 'admin', locationId: 'sp',
      startDate: day, endDate: day, startTime: start, endTime: end,
    });

  // Spring forward (Vienna, 2026-03-29 02:00 → 03:00): 01:30 is still CET (+1).
  // The single-pass copy read the offset at 01:30Z — already CEST — and put it at 23:30Z the day before.
  it('spring forward: 01:30 is 00:30Z', async () => {
    await add('2026-03-29', '01:30', '05:00');
    expect(new Date(created[0].clockInAt).toISOString()).toBe('2026-03-29T00:30:00.000Z');
  });

  // Fall back (Vienna, 2025-10-26 03:00 → 02:00): 01:30 is still CEST (+2).
  it('fall back: 01:30 is 23:30Z the evening before', async () => {
    await add('2025-10-26', '01:30', '05:00');
    expect(new Date(created[0].clockInAt).toISOString()).toBe('2025-10-25T23:30:00.000Z');
  });
});
