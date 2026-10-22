/**
 * The home asks the server in the member's order — `features/home/load-queue.ts`.
 */
import { createLoadQueue, STUCK_MS } from '../load-queue';

/** A request the test settles by hand. */
function deferred() {
  let done!: () => void;
  const p = new Promise<void>((r) => { done = r; });
  return { p, done };
}
const flush = () => new Promise((r) => setImmediate(r));

describe('load queue', () => {
  const ORDER = ['shift', 'shortcuts', 'work', 'route', 'crew', 'clients'];

  function setup(visible = ['shift', 'shortcuts', 'work']) {
    const q = createLoadQueue();
    q.setOrder(ORDER);
    q.setVisible(visible);
    const started: string[] = [];
    const pending: Record<string, ReturnType<typeof deferred>> = {};
    // One asker per card here (as a card with a single useLiveRefresh).
    const ask = (k: string) => q.request(k, () => { started.push(k); pending[k] = deferred(); return pending[k].p; }, k);
    return { q, started, pending, ask };
  }

  it('asks in the member\'s order, two at a time, whatever order the cards asked in', async () => {
    const { started, pending, ask } = setup(['shift', 'work', 'route']);
    ['route', 'work', 'shift'].forEach(ask);
    await flush();
    // Asked route-first, started shift-first: the member's order, not the mount order.
    expect(started).toEqual(['shift', 'work']);
    pending.shift!.done(); await flush();
    expect(started).toEqual(['shift', 'work', 'route']);
  });

  it('a slow signal: one at a time', async () => {
    const { q, started, pending, ask } = setup(['shift', 'work', 'route']);
    q.setSlow(true);
    ['shift', 'work', 'route'].forEach(ask);
    await flush();
    expect(started).toEqual(['shift']);
    pending.shift!.done(); await flush();
    expect(started).toEqual(['shift', 'work']);
  });

  it('below the fold waits until everything above is done (good signal)', async () => {
    const { started, pending, ask } = setup(['shift', 'work']);
    ['shift', 'work', 'crew', 'clients'].forEach(ask);
    await flush();
    expect(started).toEqual(['shift', 'work']);
    pending.shift!.done(); await flush();
    expect(started).toEqual(['shift', 'work']); // 'work' still loading → crew holds
    pending.work!.done(); await flush();
    expect(started).toEqual(['shift', 'work', 'crew', 'clients']);
  });

  it('on a slow signal, below the fold waits for the scroll', async () => {
    const { q, started, pending, ask } = setup(['shift']);
    q.setSlow(true);
    ['shift', 'crew'].forEach(ask);
    await flush();
    pending.shift!.done(); await flush();
    expect(started).toEqual(['shift']);
    q.setVisible(['crew']);
    expect(started).toEqual(['shift', 'crew']);
  });

  it('asked again while asking → once more after, never twice in parallel', async () => {
    const { q, started, pending, ask } = setup();
    ask('shift'); await flush(); ask('shift'); ask('shift'); await flush();
    expect(started).toEqual(['shift']);
    expect(q.state('shift')).toBe('loading');
    pending.shift!.done(); await flush();
    expect(started).toEqual(['shift', 'shift']);
    pending.shift!.done(); await flush();
    expect(q.state('shift')).toBe('idle');
  });

  it('a card outside the home order is never held back', async () => {
    const { started, ask } = setup();
    ask('shift'); ask('work');
    ask('gallery-preview');
    await flush();
    expect(started).toContain('gallery-preview');
  });

  it('a failing request frees its slot', async () => {
    const q = createLoadQueue();
    q.setOrder(ORDER); q.setVisible(['shift', 'work', 'route']);
    const started: string[] = [];
    q.request('shift', () => { started.push('shift'); return Promise.reject(new Error('x')); });
    q.request('work', () => { started.push('work'); return new Promise(() => undefined); });
    q.request('route', () => { started.push('route'); return Promise.resolve(); });
    await flush(); await flush();
    expect(started).toEqual(['shift', 'work', 'route']);
  });

  it('a request that never settles is released after STUCK_MS', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const q = createLoadQueue();
    q.setOrder(ORDER); q.setVisible(['shift', 'work', 'route']);
    const started: string[] = [];
    for (const k of ['shift', 'work', 'route']) q.request(k, () => { started.push(k); return new Promise(() => undefined); });
    await flush();
    expect(started).toEqual(['shift', 'work']);
    jest.advanceTimersByTime(STUCK_MS + 1);
    expect(started).toEqual(['shift', 'work', 'route']);
    jest.useRealTimers();
  });

  it('before the list reports what is on screen, the first two cards count as visible', async () => {
    const q = createLoadQueue();
    q.setOrder(ORDER);
    const started: string[] = [];
    for (const k of ['crew', 'shortcuts', 'shift']) q.request(k, () => { started.push(k); return new Promise(() => undefined); });
    await flush();
    expect(started).toEqual(['shift', 'shortcuts']);
  });
});

describe('several askers in one card', () => {
  it('BUG FIXED: both refreshes run — the second no longer replaces the first', async () => {
    const q = createLoadQueue();
    q.setOrder(['route']); q.setVisible(['route']);
    const ran: string[] = [];
    const jobs = {}; const position = {};
    q.request('route', () => { ran.push('jobs'); }, jobs);
    q.request('route', () => { ran.push('position'); }, position);
    await flush(); await flush();
    expect(ran.sort()).toEqual(['jobs', 'position']);
  });

  it('the same asker twice is still one run (its latest)', async () => {
    const q = createLoadQueue();
    q.setOrder(['route']); q.setVisible(['route']);
    const ran: string[] = [];
    const me = {};
    q.request('route', () => { ran.push('old'); }, me);
    q.request('route', () => { ran.push('new'); }, me);
    await flush(); await flush();
    expect(ran).toEqual(['new']);
  });
});
