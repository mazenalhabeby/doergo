/**
 * What the Crew card costs the network, and what it does when an answer is
 * missing — `useCrew` driven directly, with React reduced to the four hooks it
 * uses (these specs deliberately run without a renderer; see jest.config.js).
 *
 *   ⚠️ FOUR requests per refresh, no more: who is on, rests, no-shows, and the
 *      approvals COUNT (never a page of shifts).
 *   ⚠️ PRESENCE FAILS AS A WHOLE: a failed no-show read is not "everyone is in".
 *   ⚠️ LATEST ASK WINS: an older answer landing late never replaces a newer one.
 */
const state: { value: any; setters: Array<(v: any) => void> } = { value: undefined, setters: [] };
let captured: (() => unknown) | null = null;

jest.mock('react', () => ({
  useState: (init: any) => {
    if (state.value === undefined) state.value = typeof init === 'function' ? init() : init;
    const set = (v: any) => { state.value = typeof v === 'function' ? v(state.value) : v; };
    return [state.value, set];
  },
  useRef: (v: any) => ({ current: v }),
  useCallback: (fn: any) => fn,
  useEffect: () => undefined,
}));
jest.mock('@/hooks/use-live-refresh', () => ({ useLiveRefresh: (fn: () => unknown) => { captured = fn; } }));
jest.mock('../api/attendance', () => ({
  attendanceApi: {
    getClockedInAll: jest.fn(),
    getActiveBreaks: jest.fn(),
    listNoShows: jest.fn(),
    pendingApprovalsSummary: jest.fn(),
    getPendingApprovals: jest.fn(),
  },
}));

import { attendanceApi } from '../api/attendance';
import { useCrew } from '@/features/home/use-crew';

/*
  The hook, driven as a plain function over the mocked React above — no
  renderer. Named as what it is here (one render's worth of the hook), so the
  repo's rules-of-hooks lint does not read a test helper as a component.
*/
const renderOnce: (enabled: boolean) => unknown = useCrew;

const api = attendanceApi as unknown as Record<string, jest.Mock>;
const NOW_ISO = () => new Date(Date.now() - 60 * 60000).toISOString();

function mount(enabled = true) {
  state.value = undefined;
  captured = null;
  renderOnce(enabled);
  return {
    refresh: () => captured!() as Promise<void>,
    get data() { return state.value; },
  };
}

function answer() {
  api.getClockedInAll.mockResolvedValue([{ id: 'e1', userId: 'u1', locationId: 'a', clockInAt: NOW_ISO(), user: { id: 'u1', firstName: 'Ann' }, location: { id: 'a', name: 'Main' } }]);
  api.getActiveBreaks.mockResolvedValue([]);
  api.listNoShows.mockResolvedValue([]);
  api.pendingApprovalsSummary.mockResolvedValue({ total: 7, bySpace: { a: 7 } });
}

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
  answer();
});

describe('what one refresh asks', () => {
  it('exactly four requests, each once', async () => {
    const c = mount();
    await c.refresh();
    expect(api.getClockedInAll).toHaveBeenCalledTimes(1);
    expect(api.getActiveBreaks).toHaveBeenCalledTimes(1);
    expect(api.listNoShows).toHaveBeenCalledTimes(1);
    expect(api.pendingApprovalsSummary).toHaveBeenCalledTimes(1);
    // ⚠️ Never the page of shifts it used to download every minute to count.
    expect(api.getPendingApprovals).not.toHaveBeenCalled();
  });

  it('asks everyone on the clock (every page), and today\'s no-shows only', async () => {
    const c = mount();
    await c.refresh();
    expect(api.getClockedInAll).toHaveBeenCalledWith();
    expect(api.listNoShows).toHaveBeenCalledWith(1);
  });

  it('asks nothing at all for somebody without the grant', async () => {
    const c = mount(false);
    await c.refresh();
    for (const m of Object.values(api)) expect(m).not.toHaveBeenCalled();
    expect(c.data.loading).toBe(true);
  });

  it('a minute of refreshes is four requests a minute — not per person, not per workspace', async () => {
    api.getClockedInAll.mockResolvedValue(Array.from({ length: 250 }, (_, i) => ({
      id: `e${i}`, userId: `u${i}`, locationId: `s${i % 9}`, clockInAt: NOW_ISO(), user: { id: `u${i}` }, location: { id: `s${i % 9}` },
    })));
    const c = mount();
    await c.refresh();
    const total = Object.values(api).reduce((n, m) => n + m.mock.calls.length, 0);
    expect(total).toBe(4);
    expect(c.data.people).toHaveLength(250);
  });
});

describe('what an answer becomes', () => {
  it('fills people, the count and the per-workspace count', async () => {
    const c = mount();
    await c.refresh();
    expect(c.data).toMatchObject({ failed: false, loading: false, pending: 7, pendingBySpace: { a: 7 } });
    expect(c.data.people.map((p: any) => p.firstName)).toEqual(['Ann']);
  });

  it('who is on failing → offline: no people, nothing counted', async () => {
    const c = mount();
    await c.refresh();
    api.getClockedInAll.mockRejectedValue(new Error('Network request failed'));
    await c.refresh();
    expect(c.data.failed).toBe(true);
    expect(c.data.people).toEqual([]);
    expect(c.data.notArrived).toEqual([]);
  });

  /* ⚠️ It used to swallow this and draw "Everyone is in. Nothing to decide." */
  it('no-shows failing → offline too, never a calm card over somebody late', async () => {
    api.listNoShows.mockRejectedValue(new Error('500'));
    const c = mount();
    await c.refresh();
    expect(c.data.failed).toBe(true);
  });

  it('rests failing → offline too — a long break is presence', async () => {
    api.getActiveBreaks.mockRejectedValue(new Error('500'));
    const c = mount();
    await c.refresh();
    expect(c.data.failed).toBe(true);
  });

  it('only the approvals COUNT may fall back — to zero, with presence intact', async () => {
    api.pendingApprovalsSummary.mockRejectedValue(new Error('500'));
    const c = mount();
    await c.refresh();
    expect(c.data).toMatchObject({ failed: false, pending: 0, pendingBySpace: {} });
    expect(c.data.people).toHaveLength(1);
  });

  it('comes back from offline on the next good answer', async () => {
    api.getClockedInAll.mockRejectedValueOnce(new Error('offline'));
    const c = mount();
    await c.refresh();
    expect(c.data.failed).toBe(true);
    await c.refresh();
    expect(c.data.failed).toBe(false);
    expect(c.data.people).toHaveLength(1);
  });
});

describe('latest ask wins', () => {
  it('an older, slower answer never replaces a newer one', async () => {
    let releaseOld: (v: unknown) => void = () => undefined;
    api.getClockedInAll
      .mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }))   // first ask: slow
      .mockResolvedValueOnce([]);                                             // second ask: nobody on
    const c = mount();
    const first = c.refresh();
    await c.refresh();
    expect(c.data.people).toEqual([]);
    releaseOld([{ id: 'old', userId: 'ghost', clockInAt: NOW_ISO(), user: { id: 'ghost', firstName: 'Ghost' } }]);
    await first;
    expect(c.data.people).toEqual([]);
  });
});
