/**
 * When a home card asks the server again — `useLiveRefresh`, driven as a hook.
 *
 *   ⚠️ Focus, resume and reconnect arriving together are ONE ask, not three.
 *   ⚠️ An ask made with no signal absorbs nothing: the reconnect still asks.
 *   ⚠️ No polling while the app is in the background.
 *   ⚠️ Resuming the app on another tab asks nothing for the home behind it.
 *   ⚠️ A new `refresh` identity is not a trigger.
 *   ⚠️ Reconnect waits for `beforeReconnect` (the outbox's flush) first.
 */
jest.mock('react', () => require('./hook-harness').react);
jest.mock('expo-router', () => ({ useFocusEffect: require('./hook-harness').useFocusEffect }));
jest.mock('react-native', () => {
  const listeners = new Set<(s: string) => void>();
  return {
    AppState: {
      currentState: 'active',
      addEventListener: (_: string, fn: (s: string) => void) => {
        listeners.add(fn);
        return { remove: () => listeners.delete(fn) };
      },
      mockEmit: (s: string) => listeners.forEach((l) => l(s)),
    },
  };
});

import { AppState } from 'react-native';
import { focus, mountHook, settle } from './hook-harness';
import { connectivity } from '../connectivity';
import { LIVE_REFRESH_COALESCE_MS, useLiveRefresh, type LiveRefreshOptions } from '../../hooks/use-live-refresh';

const appState = AppState as unknown as { currentState: string; mockEmit: (s: string) => void };

let refresh: jest.Mock;
let everyMs: number | null = 60_000;
let options: LiveRefreshOptions = {};
function useSubject() {
  useLiveRefresh(refresh, everyMs, options);
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-09-26T09:00:00'));
  refresh = jest.fn();
  everyMs = 60_000;
  options = {};
  focus.focused = true;
  focus.epoch = 0;
  appState.currentState = 'active';
  connectivity.setNetwork('up');
});
afterEach(() => {
  jest.useRealTimers();
});

describe('what triggers an ask', () => {
  it('mounting on a focused screen asks exactly once', () => {
    mountHook(useSubject);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('a re-render with a NEW refresh function asks nothing', () => {
    const m = mountHook(useSubject);
    refresh = jest.fn();
    m.render();
    m.render();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('once a minute while showing — and the tick uses the LATEST refresh', () => {
    const m = mountHook(useSubject);
    const second = jest.fn();
    refresh = second;
    m.render();
    jest.advanceTimersByTime(60_000);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('no timer at all when asked for none (the route card)', () => {
    everyMs = null;
    mountHook(useSubject);
    jest.advanceTimersByTime(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('what does NOT trigger one', () => {
  it('the minute tick asks nothing while the app is in the background', () => {
    mountHook(useSubject);
    appState.currentState = 'background';
    jest.advanceTimersByTime(5 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('resuming the app on ANOTHER tab asks nothing for the home behind it', () => {
    const m = mountHook(useSubject);
    focus.focused = false;
    m.render();
    jest.advanceTimersByTime(LIVE_REFRESH_COALESCE_MS * 2);
    appState.mockEmit('active');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('resuming on the home asks once', () => {
    mountHook(useSubject);
    jest.advanceTimersByTime(LIVE_REFRESH_COALESCE_MS * 2);
    appState.mockEmit('active');
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('a storm is one ask', () => {
  it('focus + resume + a backgrounded tick firing on resume, together: one ask', () => {
    mountHook(useSubject);
    appState.mockEmit('active');
    appState.mockEmit('active');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reconnect straight after a resume that asked OFFLINE still asks — once', async () => {
    options = { onReconnect: true };
    connectivity.setNetwork('down');
    const m = mountHook(useSubject); // asked with no signal
    appState.mockEmit('active'); // coalesced with it
    connectivity.setNetwork('up'); // the ask that can be answered
    connectivity.setNetwork('down');
    connectivity.setNetwork('up'); // a flap inside the window: coalesced
    await settle(m);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('reconnect is opt-in: a card that did not ask for it is not refreshed by it', async () => {
    const m = mountHook(useSubject);
    connectivity.setNetwork('down');
    jest.advanceTimersByTime(LIVE_REFRESH_COALESCE_MS * 2);
    connectivity.setNetwork('up');
    await settle(m);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('reconnect waits for the queue', () => {
  it('asks only after beforeReconnect has settled', async () => {
    let release!: () => void;
    const flushed = new Promise<void>((r) => { release = r; });
    const order: string[] = [];
    options = { onReconnect: true, beforeReconnect: () => flushed.then(() => { order.push('flush'); }) };
    refresh.mockImplementation(() => { order.push('refresh'); });
    const m = mountHook(useSubject);
    order.length = 0;
    connectivity.setNetwork('down');
    jest.advanceTimersByTime(LIVE_REFRESH_COALESCE_MS * 2);
    connectivity.setNetwork('up');
    await settle(m);
    expect(order).toEqual([]);
    release();
    await settle(m);
    expect(order).toEqual(['flush', 'refresh']);
  });

  it('a failed flush does not cost the refresh', async () => {
    options = { onReconnect: true, beforeReconnect: () => Promise.reject(new Error('offline')) };
    const m = mountHook(useSubject);
    connectivity.setNetwork('down');
    jest.advanceTimersByTime(LIVE_REFRESH_COALESCE_MS * 2);
    connectivity.setNetwork('up');
    await settle(m);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('reconnecting while the home is not showing asks nothing', async () => {
    options = { onReconnect: true };
    const m = mountHook(useSubject);
    focus.focused = false;
    m.render();
    connectivity.setNetwork('down');
    jest.advanceTimersByTime(LIVE_REFRESH_COALESCE_MS * 2);
    connectivity.setNetwork('up');
    await settle(m);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
