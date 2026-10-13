/**
 * THE AUTOMATIC CLOCK ON THE PHONE.
 *
 * Background JavaScript cannot wait out a three-minute dwell, so an arrival is
 * FILED at once — dated when the member walked in — and HELD in the outbox
 * until the dwell has passed; walking out first takes it back, never sent.
 * These tests pin that, the departure's mirror image, which workspaces the OS
 * is asked to watch, what an automatic clock-in schedules, and that withdrawing
 * consent leaves nothing behind.
 */
import { AUTO_CLOCK_DEFAULTS, type AttendanceStatus, type AutoClockPlace, type AutoClockPlan } from '@hbcfield/shared/client';
import { SyncEngine, type RecordsSink, type SyncTransport } from '../../offline/sync-engine';
import { MemoryOutboxStore } from '../../offline/outbox/memory-store';
import type { OutboxOp } from '../../offline/outbox/types';
import { selectBatch } from '../../offline/outbox/scheduler';
import { applyPushResults } from '../../offline/outbox/transitions';
import { autoClockInFromPhone, undoAutoClockInFromPhone } from '../../offline/attendance/shift-actions';
import { MAX_OS_REGIONS, autoRegionId, entered, exited, remindersFor, selectAutoRegions, shiftForArrival, spaceOfRegion } from '../auto-clock/rules';
import { onRegionEvent, reevaluate, standDown, type AutoClockDeps } from '../auto-clock/runner';
import type { AutoClockNotifier } from '../auto-clock/notifications';
import { createAutoClockStore, type AutoClockState } from '../auto-clock/store';

jest.mock('../../offline/ids', () => {
  let n = 0;
  return { uuidv7: () => `0190f3c2-7b1a-7c3d-9e4f-e${String(++n).padStart(11, '0')}` };
});

/* ---------------------------------------------------------------- fixtures */

const SITE = { lat: 47.9813, lng: 13.8269 };
const T0 = Date.parse('2026-10-12T05:00:00Z'); // 07:00 in Vienna
const min = (m: number) => m * 60_000;
const SHIFT = { start: new Date(T0 + min(60)).toISOString(), end: new Date(T0 + min(60 + 8 * 60)).toISOString() }; // 08:00–16:00

function place(over: Partial<AutoClockPlace> = {}): AutoClockPlace {
  return {
    spaceId: 'hall',
    name: 'Hall 3',
    ...SITE,
    radius: 80,
    polygon: null,
    settings: { ...AUTO_CLOCK_DEFAULTS, enabled: true, dwellMinutes: 3, leadMinutes: 30, exitGraceMinutes: 10, autoRestMinutes: 30 },
    shifts: [SHIFT],
    ...over,
  };
}

const plan = (places: AutoClockPlace[] = [place()]): AutoClockPlan => ({ consentAt: '2026-10-01T08:00:00Z', places, generatedAt: new Date(T0).toISOString() });

function memoryStore() {
  const data = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => void data.set(k, v),
    removeItem: async (k: string) => void data.delete(k),
  };
  return createAutoClockStore(() => storage);
}

function recordingNotifier() {
  const log: string[] = [];
  const n: AutoClockNotifier & { log: string[] } = {
    log,
    async clockedIn(i) { log.push(`in:${i.entryId}@${i.showAt.toISOString()}`); },
    async reminders(i) {
      if (i.rest) log.push(`rest:${i.entryId}@${i.rest.startAt.toISOString()}`);
      if (i.endAt) log.push(`end:${i.entryId}@${i.endAt.toISOString()}`);
    },
    async arrivedPrompt(i) { log.push(`prompt:${i.spaceId}`); },
    async cancel(entryId, kinds) { log.push(`cancel:${entryId}:${(kinds ?? ['all']).join(',')}`); },
  };
  return n;
}

/** A world with a clock the test moves, an outbox that may or may not reach a server, and a shift the server reports. */
async function world(opts: { online?: boolean; places?: AutoClockPlace[] } = {}) {
  let now = T0;
  const pushed: OutboxOp[] = [];
  const transport: SyncTransport = {
    async push(ops) {
      if (!opts.online) throw new Error('Network request failed');
      pushed.push(...ops);
      return { ok: true, results: ops.map((o) => ({ id: o.id, status: 'applied' as const })) };
    },
    async pull() { throw new Error('unused'); },
  };
  const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };
  let n = 0;
  const engine = new SyncEngine({ userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), transport, records, newId: () => `op-${++n}`, now: () => now, random: () => 0.5 });
  await engine.start();
  const store = memoryStore();
  await store.save('u1', { organizationId: 'o1', available: true, plan: plan(opts.places), places: {} });
  const notifier = recordingNotifier();
  let status: AttendanceStatus | null = { isClockedIn: false, currentEntry: null, assignedLocations: [] } as unknown as AttendanceStatus;
  const deps: AutoClockDeps = {
    userId: 'u1',
    engine,
    store,
    notifier,
    now: () => new Date(now),
    fix: async () => ({ lat: SITE.lat, lng: SITE.lng, accuracy: 8, fixAt: new Date(now).toISOString() }),
    shift: async () => status,
  };
  return {
    engine, store, notifier, deps, pushed,
    at: (ms: number) => { now = ms; },
    clockedIn: (entry: Record<string, unknown> | null) => {
      status = { isClockedIn: !!entry, currentEntry: entry, assignedLocations: [] } as unknown as AttendanceStatus;
    },
    state: (): Promise<AutoClockState> => store.load('u1'),
    ops: (kind?: string) => engine.operations().filter((o) => !kind || o.op === kind),
  };
}

/* ---------------------------------------------------------------- the outbox */

describe('a held step in the outbox', () => {
  it('is not sent before its time, and is sent after it', async () => {
    const w = await world({ online: true });
    await w.engine.enqueue({ op: 'attendance.clockIn', lane: 'shift:e1', payload: { body: { id: 'e1' } }, holdUntil: T0 + min(3) });
    await w.engine.flush();
    expect(w.pushed).toHaveLength(0);
    expect(w.ops()[0]!.state).toBe('held');

    w.at(T0 + min(3));
    await w.engine.flush();
    expect(w.pushed.map((o) => o.payload.body)).toEqual([{ id: 'e1' }]);
    expect(w.ops()[0]!.state).toBe('done');
  });

  it('holds its lane, and tells the engine when to wake for it', () => {
    const op = (id: string, state: OutboxOp['state'], createdAt: number, extra: Partial<OutboxOp> = {}): OutboxOp => ({
      id, userId: 'u1', organizationId: 'o1', op: 'attendance.clockIn', lane: 'shift:e1', dependsOn: [], payload: {}, state, attempts: 0, createdAt, updatedAt: createdAt, ...extra,
    });
    const sel = selectBatch([op('a', 'held', 1, { nextAttemptAt: T0 + 500 }), op('b', 'pending', 2, { op: 'attendance.clockOut' })], T0);
    expect(sel.batch).toEqual([]);
    expect(sel.wakeAt).toBe(T0 + 500);
  });

  it('can be taken back, never having reached the server', async () => {
    const w = await world({ online: true });
    const op = await w.engine.enqueue({ op: 'attendance.clockIn', lane: 'shift:e1', payload: {}, holdUntil: T0 + min(3) });
    expect(await w.engine.cancelPending(op.id)).toBe(true);
    w.at(T0 + min(10));
    await w.engine.flush();
    expect(w.pushed).toHaveLength(0);
    expect(w.ops()[0]!.state).toBe('discarded');
  });

  it('counts as still on its way — the sign-out guard and the shift card see it', async () => {
    const w = await world();
    await w.engine.enqueue({ op: 'attendance.clockIn', lane: 'shift:e1', payload: {}, holdUntil: T0 + min(3) });
    expect(w.engine.hasUnsent()).toBe(true);
    expect(w.engine.snapshot().waiting).toBe(1);
  });
});

describe('undo, and the server answering a clock-in that was undone', () => {
  it('a clock-in still held is simply taken back; one already sent queues an undo with the tap’s own time', async () => {
    const w = await world();
    const held = await autoClockInFromPhone(w.engine, { locationId: 'hall', fix: { lat: 1, lng: 1, accuracy: 5, fixAt: new Date(T0).toISOString() }, at: new Date(T0), holdUntil: T0 + min(3) });
    expect(await undoAutoClockInFromPhone(w.engine, { entryId: held.entryId })).toEqual({ kind: 'withdrawn' });
    expect(w.ops('attendance.autoUndo')).toHaveLength(0);

    const v = await world({ online: true });
    const sent = await autoClockInFromPhone(v.engine, { locationId: 'hall', fix: { lat: 1, lng: 1, accuracy: 5, fixAt: new Date(T0).toISOString() }, at: new Date(T0), holdUntil: T0 });
    await v.engine.flush();
    expect(v.ops('attendance.clockIn')[0]!.state).toBe('done');
    v.at(T0 + min(5));
    await undoAutoClockInFromPhone(v.engine, { entryId: sent.entryId });
    const [undo] = v.ops('attendance.autoUndo');
    expect(undo!.payload.params).toEqual({ entryId: sent.entryId });
    // The tap's own moment, on the phone's clock — the server judges the undo window by it.
    const tapped = Date.parse((undo!.payload.body as { evidence: { occurredAt: string } }).evidence.occurredAt);
    expect(Math.abs(tapped - Date.now())).toBeLessThan(5_000);
  });

  it('AUTO_CLOCK_UNDONE drops the clock-in quietly — never shown as "not accepted"', () => {
    const op = { id: 'a', userId: 'u1', organizationId: 'o1', op: 'attendance.clockIn', lane: 'shift:e1', dependsOn: [], payload: {}, state: 'inflight', attempts: 0, createdAt: 1, updatedAt: 1 } as OutboxOp;
    const [settled] = applyPushResults([op], [{ id: 'a', status: 'conflict', code: 'AUTO_CLOCK_UNDONE', params: { id: 'e1' } }], T0);
    expect(settled!.state).toBe('discarded');
  });
});

/* ---------------------------------------------------------------- arriving */

describe('arriving', () => {
  it('files a clock-in at once, dated when they walked in, held for the dwell, marked AUTO', async () => {
    const w = await world();
    w.at(T0 + min(40)); // 07:40, inside the 30-minute lead of an 08:00 shift
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));

    const [op] = w.ops('attendance.clockIn');
    expect(op!.state).toBe('held');
    expect(op!.nextAttemptAt).toBe(T0 + min(43));
    const body = op!.payload.body as { locationId: string; trigger: string; evidence: { occurredAt: string } };
    expect(body.locationId).toBe('hall');
    expect(body.trigger).toBe('AUTO');
    expect(body.evidence.occurredAt).toBe(new Date(T0 + min(40)).toISOString());
  });

  it('dates an arrival before the window at the window’s opening, never earlier', async () => {
    const w = await world();
    w.at(T0 - min(10)); // 06:50 in the car park
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 - min(10)));
    const [op] = w.ops('attendance.clockIn');
    expect((op!.payload.body as { evidence: { occurredAt: string } }).evidence.occurredAt).toBe(new Date(T0 + min(30)).toISOString()); // 07:30
    expect(op!.nextAttemptAt).toBe(T0 + min(33));
  });

  it('a drive-past: out again inside the dwell takes it back, unsent, with its notifications', async () => {
    const w = await world({ online: true });
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    const entryId = (w.ops('attendance.clockIn')[0]!.payload.body as { id: string }).id;
    w.at(T0 + min(41));
    await onRegionEvent(w.deps, 'exit', 'hall', new Date(T0 + min(41)));

    expect(w.ops('attendance.clockIn')[0]!.state).toBe('discarded');
    w.at(T0 + min(60));
    await w.engine.flush();
    expect(w.pushed).toHaveLength(0);
    expect(w.notifier.log).toContain(`cancel:${entryId}:all`);
    expect((await w.state()).places.hall!.inOp).toBeUndefined();
  });

  it('a repeated ENTER (the OS re-reporting on re-arming) neither moves the time nor files twice', async () => {
    const w = await world();
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    w.at(T0 + min(50));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(50)));
    expect(w.ops('attendance.clockIn')).toHaveLength(1);
    expect((await w.state()).places.hall!.enteredAt).toBe(T0 + min(40));
  });

  it('asks the same local check as a tap — no usable position means a prompt, not a clock-in', async () => {
    const w = await world();
    w.deps.fix = async () => null;
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    expect(w.ops('attendance.clockIn')).toHaveLength(0);
    expect(w.notifier.log).toEqual(['prompt:hall']);
    // Once a day, not on every wake.
    await reevaluate(w.deps);
    expect(w.notifier.log).toEqual(['prompt:hall']);
  });

  it('a position outside the drawn site (the OS circle is wider) waits quietly for the next wake', async () => {
    const w = await world();
    w.deps.fix = async () => ({ lat: SITE.lat + 400 / 111_320, lng: SITE.lng, accuracy: 8, fixAt: new Date(T0 + min(40)).toISOString() });
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    expect(w.ops('attendance.clockIn')).toHaveLength(0);
    expect(w.notifier.log).toEqual([]);
  });

  it('does nothing for somebody already clocked in, nor without consent', async () => {
    const w = await world();
    w.clockedIn({ id: 'e9', locationId: 'hall', clockInAt: new Date(T0).toISOString() });
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    expect(w.ops()).toHaveLength(0);

    const v = await world();
    await v.store.save('u1', { ...(await v.state()), plan: { ...plan(), consentAt: null } });
    v.at(T0 + min(40));
    await onRegionEvent(v.deps, 'enter', 'hall', new Date(T0 + min(40)));
    expect(v.ops()).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- notifications */

describe('what an automatic clock-in schedules', () => {
  it('"clocked in · Undo" when the dwell has passed, the planned rest, and "still here?" after the grace', async () => {
    const w = await world();
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    const entryId = (w.ops('attendance.clockIn')[0]!.payload.body as { id: string }).id;
    expect(w.notifier.log).toEqual([
      `in:${entryId}@${new Date(T0 + min(43)).toISOString()}`,
      // An 8-hour shift with a 30-minute rest: centred, 11:45–12:15.
      `rest:${entryId}@${new Date(T0 + min(60 + 225)).toISOString()}`,
      `end:${entryId}@${new Date(T0 + min(60 + 480 + 10)).toISOString()}`,
    ]);
  });

  it('remindersFor skips what is already past', () => {
    const p = place();
    const shift = { start: new Date(SHIFT.start), end: new Date(SHIFT.end) };
    expect(remindersFor({ settings: p.settings, shift, now: new Date(T0 + min(600)) })).toEqual({ rest: null, end: null });
  });
});

/* ---------------------------------------------------------------- leaving */

describe('leaving', () => {
  const entry = { id: 'e1', locationId: 'hall', clockInAt: new Date(T0 + min(40)).toISOString() };

  it('after the end: a clock-out dated when they left, held for the exit grace, and no "still here?"', async () => {
    const w = await world();
    w.clockedIn(entry);
    const left = T0 + min(60 + 480 + 5); // 16:05
    w.at(left);
    await onRegionEvent(w.deps, 'exit', 'hall', new Date(left));
    const [op] = w.ops('attendance.clockOut');
    expect(op!.state).toBe('held');
    expect(op!.nextAttemptAt).toBe(left + min(10));
    const body = op!.payload.body as { entryId: string; trigger: string; evidence: { occurredAt: string } };
    expect(body).toMatchObject({ entryId: 'e1', trigger: 'AUTO' });
    expect(body.evidence.occurredAt).toBe(new Date(left).toISOString());
    expect(w.notifier.log).toContain('cancel:e1:end');
  });

  it('back inside before the grace ran out: the clock-out is taken back, unsent', async () => {
    const w = await world({ online: true });
    w.clockedIn(entry);
    const left = T0 + min(60 + 480 + 5);
    w.at(left);
    await onRegionEvent(w.deps, 'exit', 'hall', new Date(left));
    w.at(left + min(4));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(left + min(4)));
    expect(w.ops('attendance.clockOut')[0]!.state).toBe('discarded');
    w.at(left + min(30));
    await w.engine.flush();
    expect(w.pushed.filter((o) => o.op === 'attendance.clockOut')).toHaveLength(0);
  });

  it('before the end is an excursion, not a departure — nothing is filed', async () => {
    const w = await world();
    w.clockedIn(entry);
    w.at(T0 + min(200));
    await onRegionEvent(w.deps, 'exit', 'hall', new Date(T0 + min(200)));
    expect(w.ops('attendance.clockOut')).toHaveLength(0);
  });

  it('approved extra time moves the end the departure is judged by', async () => {
    const w = await world();
    w.clockedIn({ ...entry, expectedClockOutAt: new Date(T0 + min(60 + 600)).toISOString() }); // 18:00
    w.at(T0 + min(60 + 480 + 5)); // 16:05 — still inside the agreed extra time
    await onRegionEvent(w.deps, 'exit', 'hall', new Date(T0 + min(60 + 480 + 5)));
    expect(w.ops('attendance.clockOut')).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------- consent */

describe('withdrawing consent', () => {
  it('takes back what is still held, cancels every reminder and forgets the visits', async () => {
    const w = await world();
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    const entryId = (w.ops('attendance.clockIn')[0]!.payload.body as { id: string }).id;
    await standDown({ userId: 'u1', engine: w.engine, store: w.store, notifier: w.notifier });
    expect(w.ops('attendance.clockIn')[0]!.state).toBe('discarded');
    expect(w.notifier.log).toContain(`cancel:${entryId}:all`);
    expect((await w.state()).places).toEqual({});
  });

  it('what already reached the server stays — that is the record', async () => {
    const w = await world({ online: true });
    w.at(T0 + min(40));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(40)));
    w.at(T0 + min(44));
    await w.engine.flush();
    expect(w.ops('attendance.clockIn')[0]!.state).toBe('done');
    await standDown({ userId: 'u1', engine: w.engine, store: w.store, notifier: w.notifier });
    expect(w.ops('attendance.clockIn')[0]!.state).toBe('done');
  });
});

/* ---------------------------------------------------------------- arming */

describe('which workspaces the OS watches', () => {
  const at = (i: number) => place({ spaceId: `s${i}`, lat: SITE.lat + i * 0.01, lng: SITE.lng });

  it('never more than the limit, nearest first', () => {
    const many = Array.from({ length: 30 }, (_, i) => at(29 - i));
    const regions = selectAutoRegions(many, { now: new Date(T0), origin: SITE, max: MAX_OS_REGIONS - 1 });
    expect(regions).toHaveLength(19);
    expect(regions[0]!.identifier).toBe(autoRegionId('s0'));
    expect(regions[18]!.identifier).toBe(autoRegionId('s18'));
  });

  it('skips a workspace switched off, one with no shift left, and floors the radius', () => {
    const regions = selectAutoRegions(
      [
        place({ spaceId: 'off', settings: { ...place().settings, enabled: false } }),
        place({ spaceId: 'over', shifts: [{ start: new Date(T0 - min(600)).toISOString(), end: new Date(T0 - min(60)).toISOString() }] }),
        place({ spaceId: 'small', radius: 15 }),
      ],
      { now: new Date(T0), max: 19 },
    );
    expect(regions.map((r) => r.identifier)).toEqual([autoRegionId('small')]);
    expect(regions[0]!.radius).toBe(50);
  });

  it('names its regions so the one geofence task can tell them from the shift ring', () => {
    expect(spaceOfRegion(autoRegionId('hall'))).toBe('hall');
    expect(spaceOfRegion('ring:hall')).toBeNull();
    expect(spaceOfRegion('hall')).toBeNull();
  });

  it('an arrival the evening before files nothing — that is a neighbour, not a shift', () => {
    expect(shiftForArrival(place(), new Date(T0 - min(12 * 60)))).toBeNull();
    expect(shiftForArrival(place(), new Date(T0))?.start.toISOString()).toBe(SHIFT.start);
  });

  it('remembers the FIRST moment of a visit and of a departure', () => {
    const a = entered(undefined, 1);
    expect(entered(a, 5)).toBe(a);
    const b = exited(a, 9);
    expect(exited(b, 12).exitedAt).toBe(9);
    expect(entered(b, 20)).toEqual({ inside: true, enteredAt: 20 });
  });
});

/* ---------------------------------------------------------------- no fixed shift */

describe('clocked by arriving and leaving (no fixed shift)', () => {
  // Vienna, 07:00 local at T0. No shifts at all — called in.
  const presence = (window: { from: string; to: string } | null) =>
    place({ shifts: [], settings: { ...AUTO_CLOCK_DEFAULTS, enabled: true, dwellMinutes: 10, exitGraceMinutes: 20, leadMinutes: 30, autoRestMinutes: 30 }, presence: { startWindow: window, timezone: 'Europe/Vienna', noShiftMinutes: 600, noShiftLimit: false } });

  it('the OS watches the workspace though there is no shift', () => {
    expect(selectAutoRegions([presence(null)], { now: new Date(T0), max: MAX_OS_REGIONS }).map((r) => r.identifier)).toEqual([autoRegionId('hall')]);
  });

  it('inside the usual hours: a clock-in dated at the arrival, held for the dwell; "still working?" at the workspace’s hours; no rest', async () => {
    const w = await world({ places: [presence({ from: '06:30', to: '09:00' })] });
    w.at(T0);
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0));
    const [op] = w.ops('attendance.clockIn');
    expect(op!.nextAttemptAt).toBe(T0 + min(10));
    expect((op!.payload.body as { evidence: { occurredAt: string } }).evidence.occurredAt).toBe(new Date(T0).toISOString());
    expect(w.notifier.log.some((l) => l.startsWith('end:') && l.endsWith(new Date(T0 + min(600)).toISOString()))).toBe(true);
    expect(w.notifier.log.some((l) => l.startsWith('rest:'))).toBe(false);
  });

  it('outside them: asked once, nothing filed', async () => {
    const w = await world({ places: [presence({ from: '19:00', to: '23:00' })] });
    w.at(T0 + min(15));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0));
    await reevaluate(w.deps);
    expect(w.ops('attendance.clockIn')).toHaveLength(0);
    expect(w.notifier.log.filter((l) => l === 'prompt:hall')).toHaveLength(1);
  });

  it('leaving at any time after clocking in is going home, dated when they left', async () => {
    const w = await world({ places: [presence(null)] });
    w.clockedIn({ id: 'e1', locationId: 'hall', clockInAt: new Date(T0).toISOString(), expectedClockInAt: null });
    w.at(T0 + min(120));
    await onRegionEvent(w.deps, 'exit', 'hall', new Date(T0 + min(120)));
    const [op] = w.ops('attendance.clockOut');
    expect(op!.state).toBe('held');
    expect(op!.nextAttemptAt).toBe(T0 + min(140));
  });

  it('a step out shorter than the grace is taken back, never sent', async () => {
    const w = await world({ places: [presence(null)] });
    w.clockedIn({ id: 'e1', locationId: 'hall', clockInAt: new Date(T0).toISOString(), expectedClockInAt: null });
    w.at(T0 + min(120));
    await onRegionEvent(w.deps, 'exit', 'hall', new Date(T0 + min(120)));
    w.at(T0 + min(130));
    await onRegionEvent(w.deps, 'enter', 'hall', new Date(T0 + min(130)));
    expect(w.ops('attendance.clockOut').every((o) => o.state !== 'held' && o.state !== 'pending')).toBe(true);
  });
});
