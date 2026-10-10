/**
 * One resume for the whole app, at most every 30 s; a clock that sleeps in
 * the background. See app-resume-core.ts and now-ticker.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createResumeCoordinator } from '../app-resume-core';
import { createNowTicker } from '../now-ticker';

describe('the resume coordinator', () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => { t = 1_000_000; });

  it('does not fire for the launch, nor for a quick glance away inside 30 s', () => {
    const c = createResumeCoordinator({ initialState: 'active', now });
    const cb = jest.fn();
    c.onResume(cb);
    t += 10_000; c.handle('background');
    t += 5_000; c.handle('active');
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires once per return after the interval, for every subscriber together', () => {
    const c = createResumeCoordinator({ initialState: 'active', now });
    const a = jest.fn(); const b = jest.fn();
    c.onResume(a); c.onResume(b);
    t += 60_000; c.handle('background');
    t += 1_000; c.handle('active');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // The iOS permission dialog right after: inactive → active, within 30 s.
    t += 2_000; c.handle('inactive');
    t += 2_000; c.handle('active');
    expect(a).toHaveBeenCalledTimes(1);
    // A real return later.
    t += 40_000; c.handle('background');
    c.handle('active');
    expect(a).toHaveBeenCalledTimes(2);
  });

  it('counts inactive → active as a return (control centre), and active → active as nothing', () => {
    const c = createResumeCoordinator({ initialState: 'active', now });
    const cb = jest.fn();
    c.onResume(cb);
    t += 31_000; c.handle('inactive'); c.handle('active');
    expect(cb).toHaveBeenCalledTimes(1);
    t += 31_000; c.handle('active');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a launch in the background (a headless task) resumes on the first open', () => {
    const c = createResumeCoordinator({ initialState: 'background', now, minIntervalMs: 0 });
    const cb = jest.fn();
    c.onResume(cb);
    c.handle('active');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(c.isActive()).toBe(true);
  });

  it('change subscribers see EVERY change, unthrottled — sockets, locks and clocks need that', () => {
    const c = createResumeCoordinator({ initialState: 'active', now });
    const seen: string[] = [];
    c.onChange((s) => seen.push(s));
    c.handle('background'); c.handle('active'); c.handle('background'); c.handle('active');
    expect(seen).toEqual(['background', 'active', 'background', 'active']);
  });

  it('unsubscribing stops the calls, and one failing subscriber does not stop the others', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = createResumeCoordinator({ initialState: 'active', now });
    const bad = jest.fn(() => { throw new Error('boom'); });
    const good = jest.fn();
    const off = c.onResume(good);
    c.onResume(bad);
    t += 31_000; c.handle('background'); c.handle('active');
    expect(good).toHaveBeenCalledTimes(1);
    off();
    t += 31_000; c.handle('background'); c.handle('active');
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('the now ticker', () => {
  function fakeTimers() {
    let next = 1;
    const timers = new Map<number, { fn: () => void; ms: number }>();
    return {
      set: (fn: () => void, ms: number) => { const id = next++; timers.set(id, { fn, ms }); return id; },
      clear: (id: unknown) => { timers.delete(id as number); },
      fire: () => [...timers.values()].forEach((x) => x.fn()),
      count: () => timers.size,
    };
  }

  it('ticks on its interval while running, and holds NO timer while paused', () => {
    const timers = fakeTimers();
    let t = 100;
    const ticks: number[] = [];
    const ticker = createNowTicker({ intervalMs: 30_000, onTick: (n) => ticks.push(n), now: () => t, setInterval: timers.set, clearInterval: timers.clear });
    ticker.setRunning(true, false);
    expect(ticks).toEqual([]);
    t = 200; timers.fire();
    expect(ticks).toEqual([200]);
    ticker.setRunning(false);
    expect(timers.count()).toBe(0);
  });

  it('moves at once on the way back, so a woken screen is right before the next tick', () => {
    const timers = fakeTimers();
    let t = 0;
    const ticks: number[] = [];
    const ticker = createNowTicker({ intervalMs: 60_000, onTick: (n) => ticks.push(n), now: () => t, setInterval: timers.set, clearInterval: timers.clear });
    ticker.setRunning(true, false);
    ticker.setRunning(false);
    t = 3_600_000;
    ticker.setRunning(true, true);
    expect(ticks).toEqual([3_600_000]);
    expect(timers.count()).toBe(1);
  });

  it('starting twice keeps ONE timer', () => {
    const timers = fakeTimers();
    const ticker = createNowTicker({ intervalMs: 1_000, onTick: () => undefined, setInterval: timers.set, clearInterval: timers.clear });
    ticker.setRunning(true); ticker.setRunning(true);
    expect(timers.count()).toBe(1);
    ticker.stop();
    expect(timers.count()).toBe(0);
  });
});

describe('no screen keeps its own minute ticker', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  function* walk(dir: string): Generator<string> {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') yield* walk(full); }
      else if (/\.tsx?$/.test(e.name)) yield full;
    }
  }
  it('setInterval(() => setNow(…)) is gone — useNow pauses in the background', () => {
    const offenders: string[] = [];
    for (const root of ['src', 'app']) {
      for (const f of walk(path.join(ROOT, root))) {
        if (/setInterval\(\s*\(\)\s*=>\s*setNow\(/.test(fs.readFileSync(f, 'utf8'))) offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });
});
