/**
 * Clocking in, resting and clocking out with no signal — the phone's half.
 */
import type { AttendanceStatus, BreakStatus, CompanyLocation } from '@hbcfield/shared/client';
import { SyncEngine, type SyncTransport, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { overlayShift } from '../attendance/shift-overlay';
import { checkClockInLocally } from '../attendance/clock-in-check';
import type { OutboxOp } from '../outbox/types';

jest.mock('../ids', () => {
  let n = 0;
  return { uuidv7: () => `0190f3c2-7b1a-7c3d-9e4f-e${String(++n).padStart(11, '0')}` };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const actions = require('../attendance/shift-actions') as typeof import('../attendance/shift-actions');

const SITE = { lat: 47.9813, lng: 13.8269 };
const warehouse = { id: 'loc-1', name: 'Warehouse', ...SITE, geofenceRadius: 80, geofencePolygon: null, awayAllowed: false } as unknown as CompanyLocation;
const fix = (lat: number, lng: number, over: Record<string, unknown> = {}) => ({ lat, lng, accuracy: 9, fixAt: new Date().toISOString(), ...over });
/** Roughly `m` metres north of the site. */
const north = (m: number) => fix(SITE.lat + m / 111_320, SITE.lng);

describe('checkClockInLocally — the same answer offline as online', () => {
  it('lets somebody inside the range clock in', () => {
    expect(checkClockInLocally({ location: warehouse, fix: north(18), alreadyClockedIn: false })).toEqual({ ok: true, away: false, distanceM: 18 });
  });

  it('refuses somebody outside a strict site, saying how far and what is allowed', () => {
    expect(checkClockInLocally({ location: warehouse, fix: north(340), alreadyClockedIn: false })).toEqual({
      ok: false, code: 'OUTSIDE_SITE', distanceM: 340, radiusM: 80,
    });
  });

  it('accepts the same position as away where the member may work away', () => {
    expect(checkClockInLocally({ location: { ...warehouse, awayAllowed: true }, fix: north(340), alreadyClockedIn: false })).toMatchObject({ ok: true, away: true });
  });

  it('waits for a precise position, and refuses an old one', () => {
    expect(checkClockInLocally({ location: warehouse, fix: north(10) && fix(SITE.lat, SITE.lng, { accuracy: 240 }), alreadyClockedIn: false })).toMatchObject({ ok: false, code: 'FIX_INACCURATE' });
    const stale = fix(SITE.lat, SITE.lng, { fixAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    expect(checkClockInLocally({ location: warehouse, fix: stale, alreadyClockedIn: false })).toMatchObject({ ok: false, code: 'FIX_NOT_AT_TAP' });
  });

  it('never refuses a site with no coordinates, and refuses a second clock-in', () => {
    expect(checkClockInLocally({ location: { ...warehouse, lat: null, lng: null } as never, fix: north(5000), alreadyClockedIn: false })).toMatchObject({ ok: true });
    expect(checkClockInLocally({ location: warehouse, fix: north(5), alreadyClockedIn: true })).toMatchObject({ ok: false, code: 'ALREADY_CLOCKED_IN' });
  });
});

describe('overlayShift', () => {
  const server = {
    status: { isClockedIn: false, currentEntry: null, assignedLocations: [warehouse] } as AttendanceStatus,
    breaks: { isClockedIn: false, isOnBreak: false, currentBreak: null, todayBreaks: [], totalBreakMinutes: 0 } as BreakStatus,
    serverAt: 1_000,
  };
  const op = (over: Partial<OutboxOp>): OutboxOp => ({
    id: 'o', userId: 'u1', organizationId: 'o1', op: 'attendance.clockIn', lane: 'shift:e1', entityId: 'e1', dependsOn: [],
    payload: { body: {} }, state: 'pending', attempts: 0, createdAt: 2_000, updatedAt: 2_000, ...over,
  });

  it('shows a clock-in made offline as a running shift from the tap, then a rest, then the end of it', () => {
    const ops = [
      op({ id: 'a', payload: { body: { id: 'e1', locationId: 'loc-1', evidence: { occurredAt: '2026-09-14T07:58:00.000Z' } } } }),
      op({ id: 'b', op: 'attendance.breakStart', createdAt: 3_000, payload: { body: { id: 'b1', entryId: 'e1', evidence: { occurredAt: '2026-09-14T10:00:00.000Z' } } } }),
    ];
    const onRest = overlayShift(server, ops);
    expect(onRest.pendingSync).toBe(true);
    expect(onRest.status?.currentEntry).toMatchObject({ id: 'e1', clockInAt: '2026-09-14T07:58:00.000Z', location: { name: 'Warehouse' }, pendingSync: true });
    expect(onRest.breaks).toMatchObject({ isOnBreak: true, currentBreak: { id: 'b1', startedAt: '2026-09-14T10:00:00.000Z' } });

    const back = overlayShift(server, [...ops, op({ id: 'c', op: 'attendance.breakEnd', createdAt: 4_000, payload: { body: { breakId: 'b1', evidence: { occurredAt: '2026-09-14T10:30:00.000Z' } } } })]);
    expect(back.breaks).toMatchObject({ isOnBreak: false, totalBreakMinutes: 30 });

    const out = overlayShift(server, [...ops, op({ id: 'd', op: 'attendance.clockOut', createdAt: 5_000, payload: { body: { entryId: 'e1' } } })]);
    expect(out.status).toMatchObject({ isClockedIn: false, currentEntry: null });
  });

  it('drops a refused clock-in at once, and keeps an accepted one until the server copy is newer', () => {
    const accepted = op({ state: 'done', updatedAt: 5_000, payload: { body: { id: 'e1', locationId: 'loc-1' } } });
    expect(overlayShift(server, [accepted]).status?.isClockedIn).toBe(true);
    expect(overlayShift({ ...server, serverAt: 6_000 }, [accepted]).status?.isClockedIn).toBe(false);
    expect(overlayShift(server, [op({ state: 'failed' })]).status?.isClockedIn).toBe(false);
  });
});

describe('shift actions through the outbox', () => {
  function engineOffline() {
    const sent: OutboxOp[][] = [];
    const transport: SyncTransport = {
      async push(ops) {
        sent.push(ops);
        throw new Error('Network request failed');
      },
      async pull() {
        throw new Error('unused');
      },
    };
    const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
    let n = 0;
    const e = new SyncEngine({ userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records, newId: () => `op-${++n}`, random: () => 0.5 });
    const settleFast = e.enqueueAndSettle.bind(e);
    e.enqueueAndSettle = (input) => settleFast(input, 5);
    return e;
  }

  it('keeps a whole offline shift in one lane, each step waiting for the one before it', async () => {
    const e = engineOffline();
    await e.start();
    const { entryId, outcome } = await actions.clockInFromPhone(e, { locationId: 'loc-1', fix: north(10) });
    expect(outcome.kind).toBe('queued');
    const { breakId } = await actions.startRestFromPhone(e, { entryId });
    await actions.endRestFromPhone(e, { entryId, breakId });
    await actions.clockOutFromPhone(e, { entryId, fix: north(12) });

    const ops = e.operations();
    const [clockIn, rest, restEnd, clockOut] = ['attendance.clockIn', 'attendance.breakStart', 'attendance.breakEnd', 'attendance.clockOut'].map((name) => ops.find((o) => o.op === name)!);
    expect(new Set(ops.map((o) => o.lane))).toEqual(new Set([`shift:${entryId}`]));
    expect(clockIn!.payload.body).toMatchObject({ id: entryId, locationId: 'loc-1', evidence: { fix: expect.objectContaining({ accuracy: 9 }) } });
    expect(rest!.dependsOn).toEqual([clockIn!.id]);
    expect(restEnd!.dependsOn).toEqual([rest!.id]);
    expect(clockOut!.dependsOn).toEqual([clockIn!.id]);
    expect(clockOut!.payload.body).toMatchObject({ entryId, evidence: { occurredAt: expect.any(String) } });
  });

  it('adds no dependency for a shift the server already has', async () => {
    const e = engineOffline();
    await e.start();
    await actions.clockOutFromPhone(e, { entryId: 'cuid-from-server-001', fix: null });
    expect(e.operations()[0]).toMatchObject({ lane: 'shift:cuid-from-server-001', dependsOn: [] });
    expect(e.operations()[0]!.payload.body).not.toHaveProperty('lat');
  });
});
