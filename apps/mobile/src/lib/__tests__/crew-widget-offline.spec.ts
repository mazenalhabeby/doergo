/**
 * ⚠️ PRESENCE IS NEVER KEPT. The Crew card must never draw who is on from a
 * response the phone saved earlier — "6h 53 late" about somebody who arrived an
 * hour ago, under a fresh clock. Pinned against the EXACT calls the card's API
 * helpers make — the endpoint, its arguments and its own `keep` verdict — not
 * against hand-typed URLs.
 */
jest.mock('../api/client', () => ({ call: jest.fn(), E: jest.requireActual('@hbcfield/shared/client').apiEndpoints }));
import { call } from '../api/client';
import { attendanceApi } from '../api/attendance';
import { shouldKeep } from '../api/response-cache';

const fetchMock = call as unknown as jest.Mock;

type Def = { path: (a: unknown) => string; keep?: boolean | ((a: unknown) => boolean) };

/** What the client asks for one call: the path, and whether the cache may hold the answer. */
function asked(n = 0): { url: string; kept: boolean } {
  const [def, args] = fetchMock.mock.calls[n] as [Def, unknown];
  const url = def.path(args);
  const keep = typeof def.keep === 'function' ? def.keep(args) : def.keep;
  return { url, kept: shouldKeep(url, keep) };
}

async function urlOf(run: () => Promise<unknown>): Promise<{ url: string; kept: boolean }> {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: [] });
  await run();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return asked();
}

describe('the Crew card reads nothing from the phone\'s store', () => {
  it('the approvals COUNT is never kept either (it sits beside presence)', async () => {
    const r = await urlOf(() => attendanceApi.pendingApprovalsSummary());
    expect(r).toEqual({ url: '/attendance/approvals/pending?summary=true', kept: false });
  });

  it('who is on — every page of all-entries?status=CLOCKED_IN, as the card asks it', async () => {
    const r = await urlOf(() => attendanceApi.getClockedInAll());
    expect(r.url).toContain('status=CLOCKED_IN');
    expect(r.kept).toBe(false);
  });

  it('who is on a rest', async () => {
    expect((await urlOf(() => attendanceApi.getActiveBreaks())).kept).toBe(false);
  });

  it('who is on the clock now, org-wide', async () => {
    expect((await urlOf(() => attendanceApi.getActiveEntries())).kept).toBe(false);
  });

  it('who has not come — today\'s no-shows', async () => {
    const r = await urlOf(() => attendanceApi.listNoShows(1));
    expect(r.url).toContain('days=1');
    expect(r.kept).toBe(false);
  });

  it('a history of CLOCKED_OUT shifts is still kept — the exclusion is presence only', async () => {
    const r = await urlOf(() => attendanceApi.getAllEntries({ startDate: '2026-09-01', endDate: '2026-09-07', status: 'CLOCKED_OUT' }));
    expect(r.kept).toBe(true);
  });

  it('the approvals count reads the summary route, never a page of shifts', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ total: 95, bySpace: { a: 30 } });
    const r = await attendanceApi.pendingApprovalsSummary();
    expect(asked().url).toBe('/attendance/approvals/pending?summary=true');
    expect(r).toEqual({ total: 95, bySpace: { a: 30 } });
  });

  it('a malformed summary is zero, never NaN', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ data: [] });
    expect(await attendanceApi.pendingApprovalsSummary()).toEqual({ total: 0, bySpace: {} });
  });
});

describe('getClockedInAll — past one page, the rest are fetched', () => {
  it('BUG FIXED: 1,200 on the clock → three pages, 1,200 people, not a silent 300', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_def: unknown, args: { page?: number }) => {
      const page = args?.page ?? 1;
      return Array.from({ length: page < 3 ? 500 : 200 }, (_, k) => ({ id: `e${page}-${k}` }));
    });
    const rows = await attendanceApi.getClockedInAll();
    expect(rows).toHaveLength(1200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a normal site is ONE request', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await attendanceApi.getClockedInAll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
