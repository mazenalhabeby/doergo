import {
  actionableOf,
  APPROVALS_READY_AFTER_MS,
  watchApprovalsCount,
  type WaitingState,
} from '../approvals-waiting-read';

/* The home strip never waits long for the approvals fan-out: ready after 1.5 s at the latest, the count follows. */

function harness() {
  let state: WaitingState = { count: 0, ready: false };
  const set = (next: (prev: WaitingState) => WaitingState) => {
    state = next(state);
  };
  return { set, get: () => state };
}
const flush = () => Promise.resolve().then(() => undefined);

describe('the approvals count on home', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is ready after the deadline while the read is still running, and takes the count when it lands', async () => {
    let resolve!: (x: { total: number; actionable?: number }) => void;
    const h = harness();
    watchApprovalsCount(() => new Promise((r) => (resolve = r)), h.set);
    jest.advanceTimersByTime(APPROVALS_READY_AFTER_MS - 1);
    expect(h.get()).toEqual({ count: 0, ready: false });
    jest.advanceTimersByTime(1);
    expect(h.get()).toEqual({ count: 0, ready: true });
    resolve({ total: 5, actionable: 3 });
    await flush();
    await flush();
    expect(h.get()).toEqual({ count: 3, ready: true });
  });

  it('is ready at once when the answer comes first, and a failure shows nothing', async () => {
    const ok = harness();
    watchApprovalsCount(() => Promise.resolve({ total: 2, actionable: 1 }), ok.set);
    await flush();
    await flush();
    expect(ok.get()).toEqual({ count: 1, ready: true });
    const bad = harness();
    watchApprovalsCount(() => Promise.reject(new Error('offline')), bad.set);
    await flush();
    await flush();
    expect(bad.get()).toEqual({ count: 0, ready: true });
  });

  it('writes nothing once the screen lost focus', async () => {
    let resolve!: (x: { total: number }) => void;
    const h = harness();
    const stop = watchApprovalsCount(() => new Promise((r) => (resolve = r)), h.set);
    stop();
    jest.advanceTimersByTime(APPROVALS_READY_AFTER_MS);
    resolve({ total: 4 });
    await flush();
    expect(h.get()).toEqual({ count: 0, ready: false });
  });

  it('counts what can be acted on, or the total from an older server', () => {
    expect(actionableOf({ total: 5, actionable: 2 })).toBe(2);
    expect(actionableOf({ total: 5 })).toBe(5);
    expect(actionableOf({ total: 5, actionable: 0 })).toBe(0);
  });
});
