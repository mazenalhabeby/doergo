/**
 * Where somebody on the clock is working now — every case from the mockup,
 * the one-button workspace choice, and the service that keeps it in step.
 */
import {
  PRESENCE, decidePresence, replayPresence, presenceFreshness, chooseClockInLocation, rankClockInLocations,
  type PresenceJob, type PresenceState,
} from '@hbcfield/shared';
import { PresenceService } from '../presence/presence.service';

const OFFICE = { lat: 47.9813, lng: 13.8269 };
/** Roughly `m` metres north of a point. */
const north = (from: { lat: number; lng: number }, m: number) => ({ lat: from.lat + m / 111_320, lng: from.lng });
const none: PresenceJob[] = [];
const step = (state: PresenceState, point: { lat: number; lng: number }, insideArea: boolean, jobs = none) => {
  const d = decidePresence({ point, insideArea, jobs, state });
  return { d, state: { presence: d.presence, anchor: d.anchor } as PresenceState };
};
const START: PresenceState = { presence: null, anchor: null };

describe('the rules, case by case', () => {
  it('office worker: café first (Remote), then walks in (On site)', () => {
    let s = step(START, north(OFFICE, 60), false);
    expect(s.d).toMatchObject({ presence: 'REMOTE', reason: 'AWAY' });
    s = step(s.state, OFFICE, true);
    expect(s.d).toMatchObject({ presence: 'ON_SITE', reason: 'INSIDE_AREA', changed: true });
  });

  it('office worker: lunch just outside stays On site', () => {
    const s = step(step(START, OFFICE, true).state, north(OFFICE, 120), false);
    expect(s.d).toMatchObject({ presence: 'ON_SITE', reason: 'NEAR_AREA', changed: false });
  });

  it('office worker: a client meeting is the field only while away', () => {
    let s = step(START, OFFICE, true);
    s = step(s.state, north(OFFICE, 6000), false);
    expect(s.d).toMatchObject({ presence: 'FIELD', reason: 'MOVED' });
    s = step(s.state, north(OFFICE, 6010), false);
    expect(s.d).toMatchObject({ presence: 'FIELD', reason: 'STILL_OUT', changed: false });
    s = step(s.state, OFFICE, true);
    expect(s.d.presence).toBe('ON_SITE');
  });

  it('office worker: a job handled online (no address, not on its way) does not move them', () => {
    const home = north(OFFICE, 9000);
    const s = step(START, home, false, [{ lat: null, lng: null, onTheWay: false }]);
    expect(s.d).toMatchObject({ presence: 'REMOTE', reason: 'AWAY' });
  });

  it('sales: clocks in at home, then drives to clients, then a coffee between them', () => {
    const home = north(OFFICE, 9000);
    let s = step(START, home, false);
    expect(s.d.presence).toBe('REMOTE');
    s = step(s.state, north(home, 4000), false);
    expect(s.d).toMatchObject({ presence: 'FIELD', reason: 'MOVED' });
    s = step(s.state, north(home, 4050), false);
    expect(s.d).toMatchObject({ presence: 'FIELD', changed: false });
  });

  it('slow drift adds up: the anchor stays where the change happened', () => {
    const home = north(OFFICE, 9000);
    let s = step(START, home, false);
    for (const m of [200, 400, 600]) s = step(s.state, north(home, m), false);
    expect(s.d).toMatchObject({ presence: 'FIELD', reason: 'MOVED' });
  });

  it('technician: clocks in near home with jobs at an address today', () => {
    const s = step(START, north(OFFICE, 20000), false, [{ ...north(OFFICE, 30000), onTheWay: false }]);
    expect(s.d).toMatchObject({ presence: 'FIELD', reason: 'JOBS_TODAY' });
  });

  it('a job on its way, or standing at its address, is the field', () => {
    expect(decidePresence({ point: OFFICE, insideArea: false, jobs: [{ lat: null, lng: null, onTheWay: true }], state: START }).reason).toBe('ON_THE_WAY');
    const job = north(OFFICE, 15000);
    expect(decidePresence({ point: north(job, PRESENCE.AT_JOB_METERS - 20), insideArea: false, jobs: [{ ...job, onTheWay: false }], state: START }).reason).toBe('AT_JOB');
  });

  it('inside the area wins over everything, a job on its way included', () => {
    expect(decidePresence({ point: OFFICE, insideArea: true, jobs: [{ lat: null, lng: null, onTheWay: true }], state: START }).presence).toBe('ON_SITE');
  });

  it('an offline batch returns only the changes, each with its own time', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 8, 15, 8, m));
    const run = replayPresence({
      jobs: none,
      state: START,
      points: [
        { ...OFFICE, at: t(0), insideArea: true },
        { ...OFFICE, at: t(5), insideArea: true },
        { ...north(OFFICE, 3000), at: t(10), insideArea: false },
        { ...north(OFFICE, 3100), at: t(15), insideArea: false },
      ],
    });
    expect(run.changes.map((c) => [c.at.getUTCMinutes(), c.presence, c.reason])).toEqual([[0, 'ON_SITE', 'INSIDE_AREA'], [10, 'FIELD', 'MOVED']]);
    expect(run.state.presence).toBe('FIELD');
  });

  it('says how fresh the group is', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    expect(presenceFreshness({ clockInAt: '2026-09-15T08:00:00Z', lastSeenAt: '2026-09-15T11:50:00Z', now })).toBe('LIVE');
    expect(presenceFreshness({ clockInAt: '2026-09-15T08:00:00Z', lastSeenAt: '2026-09-15T10:40:00Z', now })).toBe('NO_SIGNAL');
    expect(presenceFreshness({ clockInAt: '2026-09-15T08:00:00Z', lastSeenAt: null, now })).toBe('NO_LIVE_UPDATES');
    expect(presenceFreshness({ clockInAt: '2026-09-15T11:55:00Z', lastSeenAt: null, now })).toBe('LIVE');
  });
});

describe('one-button clock-in: which workspace', () => {
  const office = { id: 'office', ...OFFICE, geofenceRadius: 50 };
  const warehouse = { id: 'warehouse', ...north(OFFICE, 9000), geofenceRadius: 80 };
  const service = { id: 'service', ...north(OFFICE, 18000), geofenceRadius: 40 };

  it('clocks in without asking with one workspace, or inside exactly one area', () => {
    expect(chooseClockInLocation([office], null)).toMatchObject({ kind: 'auto', why: 'ONLY_ONE' });
    expect(chooseClockInLocation([office, warehouse], { ...warehouse, accuracy: 10 })).toMatchObject({ kind: 'auto', why: 'INSIDE_AREA', location: { id: 'warehouse' } });
    expect(chooseClockInLocation([], null)).toEqual({ kind: 'none' });
  });

  it('asks when two areas overlap around them — that is not certain', () => {
    const twin = { ...office, id: 'office-2' };
    expect(chooseClockInLocation([office, twin], { ...OFFICE, accuracy: 5 }).kind).toBe('ask');
  });

  it('orders the list: a shift today, then primary, then nearest', () => {
    const fix = { ...north(OFFICE, 2400), accuracy: 10 };
    const ranked = rankClockInLocations([{ ...service, isPrimary: true }, warehouse, { ...office, shiftToday: true }], fix);
    expect(ranked.map((r) => r.location.id)).toEqual(['office', 'service', 'warehouse']);
    expect(rankClockInLocations([service, warehouse, office], fix).map((r) => r.location.id)).toEqual(['office', 'warehouse', 'service']);
  });

  it('never counts a workspace with no area as "inside"', () => {
    const logical = { id: 'logical', lat: null, lng: null, geofenceRadius: 0 };
    expect(chooseClockInLocation([logical, office], null).kind).toBe('ask');
  });
});

describe('PresenceService', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'e1', userId: 'u1', organizationId: 'org-1', timezone: 'Europe/Vienna',
    presence: 'ON_SITE', presenceAt: new Date('2026-09-15T08:00:00Z'), lastSeenAt: new Date('2026-09-15T11:55:00Z'), ...over,
  });

  function build(opts: { claimed?: number; anchor?: { anchorLat: number; anchorLng: number } | null; jobs?: any[] } = {}) {
    const tx: any = {
      timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: opts.claimed ?? 1 }) },
      timeEntryPresence: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = {
      timeEntry: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn() },
      timeEntryPresence: {
        findFirst: jest.fn().mockResolvedValue(opts.anchor === undefined ? { anchorLat: OFFICE.lat, anchorLng: OFFICE.lng } : opts.anchor),
        findMany: jest.fn().mockResolvedValue([]),
      },
      task: { findMany: jest.fn().mockResolvedValue(opts.jobs ?? []) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const emit = jest.fn();
    return { svc: new PresenceService(prisma, { emit } as any), prisma, tx, emit };
  }
  const NOW = new Date('2026-09-15T12:00:00Z');

  it('inside the area, unchanged: reads nothing and writes nothing', async () => {
    const { svc, prisma, emit } = build();
    await svc.onPosition(entry(), OFFICE, true, NOW);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.timeEntryPresence.findFirst).not.toHaveBeenCalled();
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('refreshes "last seen" at most every ten minutes', async () => {
    const { svc, prisma } = build();
    await svc.onPosition(entry({ lastSeenAt: new Date(NOW.getTime() - PRESENCE.SEEN_WRITE_EVERY_MS) }), OFFICE, true, NOW);
    expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { lastSeenAt: NOW } });
  });

  it('a change is claimed against the state it was decided from, recorded once, and announced without any position', async () => {
    const { svc, tx, emit } = build();
    await svc.onPosition(entry(), north(OFFICE, 5000), false, NOW);
    expect(tx.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', status: 'CLOCKED_IN', presenceAt: entry().presenceAt },
      data: { presence: 'FIELD', presenceReason: 'MOVED', presenceAt: NOW, lastSeenAt: NOW },
    });
    expect(tx.timeEntryPresence.createMany.mock.calls[0][0].data[0]).toMatchObject({ presence: 'FIELD', reason: 'MOVED', sentLate: false });
    expect(emit).toHaveBeenCalledWith('attendance_changed', { organizationId: 'org-1', action: 'presence', entryId: 'e1' });
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/lat|lng/i);
  });

  it('a lost claim records nothing and announces nothing', async () => {
    const { svc, tx, emit } = build({ claimed: 0 });
    await svc.onPosition(entry(), north(OFFICE, 5000), false, NOW);
    expect(tx.timeEntryPresence.createMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('never fails the heartbeat it rides on', async () => {
    const { svc, prisma } = build();
    prisma.task.findMany.mockRejectedValue(new Error('db down'));
    await expect(svc.onPosition(entry(), north(OFFICE, 5000), false, NOW)).resolves.toBeUndefined();
  });

  it('only asks for the member’s own open jobs, due today or on their way', async () => {
    const { svc, prisma } = build();
    await svc.onPosition(entry(), north(OFFICE, 100), false, NOW);
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-1');
    expect(where.OR).toEqual([{ assignedToId: 'u1' }, { assignees: { some: { userId: 'u1' } } }]);
    expect(where.status.notIn).toEqual(expect.arrayContaining(['COMPLETED', 'CANCELED', 'CLOSED']));
    expect(prisma.task.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(25);
  });

  it('a batch writes every change once, marked as sent late, and announces once', async () => {
    const { svc, tx, emit } = build();
    const t = (m: number) => new Date(Date.UTC(2026, 8, 15, 9, m));
    await svc.onBatch(entry({ presence: 'ON_SITE' }), [
      { ...north(OFFICE, 3000), at: t(0), insideArea: false },
      { ...OFFICE, at: t(30), insideArea: true },
    ]);
    const rows = tx.timeEntryPresence.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.presence)).toEqual(['FIELD', 'ON_SITE']);
    expect(rows.every((r: any) => r.sentLate)).toBe(true);
    expect(tx.timeEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('the day it returns never includes a position', async () => {
    const { svc, prisma } = build();
    await svc.history('e1', 'org-1');
    expect(prisma.timeEntryPresence.findMany.mock.calls[0][0]).toEqual({
      where: { timeEntryId: 'e1', organizationId: 'org-1' },
      orderBy: { at: 'asc' },
      take: 200,
      select: { at: true, presence: true, reason: true, sentLate: true },
    });
  });

  it('a job on its way moves only its member’s own open entry, and not twice', async () => {
    const { svc, prisma, tx } = build();
    prisma.timeEntry.findFirst.mockResolvedValue(entry({ presence: 'REMOTE' }));
    await svc.onJobMoved({ userId: 'u1', organizationId: 'org-1', reason: 'ON_THE_WAY', at: NOW });
    expect(prisma.timeEntry.findFirst.mock.calls[0][0].where).toEqual({ userId: 'u1', organizationId: 'org-1', status: 'CLOCKED_IN' });
    expect(tx.timeEntry.updateMany.mock.calls[0][0].data).toMatchObject({ presence: 'FIELD', presenceReason: 'ON_THE_WAY' });

    const again = build();
    again.prisma.timeEntry.findFirst.mockResolvedValue(entry({ presence: 'FIELD' }));
    await again.svc.onJobMoved({ userId: 'u1', organizationId: 'org-1', reason: 'AT_JOB', at: NOW });
    expect(again.tx.timeEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe('the position of a change stays in the presence service', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execSync } = require('child_process') as typeof import('child_process');
  it('no other file in any app reads or returns the anchor', () => {
    const root = require('path').resolve(__dirname, '../../../../../../..');
    const hits = execSync(
      `grep -rlE "anchorLat|anchorLng" apps/api/*/src apps/web-app/src apps/mobile/src apps/mobile/app packages/shared/src --include=*.ts --include=*.tsx || true`,
      { cwd: root, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.endsWith('presence/presence.service.ts') && !f.includes('__tests__'));
    expect(hits).toEqual([]);
  });
});

describe('getEntryPresence', () => {
  it('is "not found" outside the caller’s spaces, and asks the history nothing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AttendanceService } = require('../attendance.service');
    const svc = Object.create(AttendanceService.prototype);
    svc.prisma = { timeEntry: { findFirst: jest.fn().mockResolvedValue(null) } };
    svc.presence = { history: jest.fn() };
    await expect(svc.getEntryPresence({ entryId: 'e1', organizationId: 'org-1', scopeSpaceIds: ['loc-2'] })).rejects.toThrow('not found');
    expect(svc.prisma.timeEntry.findFirst.mock.calls[0][0].where).toEqual({ id: 'e1', organizationId: 'org-1', locationId: { in: ['loc-2'] } });
    expect(svc.presence.history).not.toHaveBeenCalled();
  });
});
