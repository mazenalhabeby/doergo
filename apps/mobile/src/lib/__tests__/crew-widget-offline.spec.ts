/**
 * ⚠️ PRESENCE IS NEVER KEPT. The Crew card must never draw who is on from a
 * response the phone saved earlier — "6h 53 late" about somebody who arrived an
 * hour ago, under a fresh clock. Pinned against the EXACT URLs the card's API
 * helpers build, not against hand-typed ones: a reordered query string or a
 * new parameter would otherwise slip past the NEVER list silently.
 */
jest.mock('../api/client', () => ({ fetchWithAuth: jest.fn() }));
import { fetchWithAuth } from '../api/client';
import { attendanceApi } from '../api/attendance';
import { isKeptResponse } from '../api/response-cache';

const fetchMock = fetchWithAuth as unknown as jest.Mock;

async function urlOf(call: () => Promise<unknown>): Promise<string> {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ data: [] });
  await call();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return fetchMock.mock.calls[0][0] as string;
}

describe('the Crew card reads nothing from the phone\'s store', () => {
  it('the approvals COUNT is never kept either (it sits beside presence)', () => {
    expect(isKeptResponse('/attendance/approvals/pending?summary=true')).toBe(false);
    expect(isKeptResponse('/attendance/approvals/pending?page=1&summary=true')).toBe(false);
  });

  it('who is on — every page of all-entries?status=CLOCKED_IN, as the card asks it', async () => {
    const url = await urlOf(() => attendanceApi.getClockedInAll());
    expect(url).toContain('status=CLOCKED_IN');
    expect(isKeptResponse(url)).toBe(false);
  });

  it('who is on a rest', async () => {
    const url = await urlOf(() => attendanceApi.getActiveBreaks());
    expect(isKeptResponse(url)).toBe(false);
  });

  it('who has not come — today\'s no-shows', async () => {
    const url = await urlOf(() => attendanceApi.listNoShows(1));
    expect(url).toContain('days=1');
    expect(isKeptResponse(url)).toBe(false);
  });

  it('presence stays unkept whatever order the query takes', () => {
    for (const u of [
      '/attendance/all-entries?status=CLOCKED_IN',
      '/attendance/all-entries?limit=300&status=CLOCKED_IN',
      '/attendance/all-entries?page=1&limit=300&status=CLOCKED_IN',
      '/attendance/breaks/active',
      '/attendance/no-shows?days=1',
      '/attendance/no-shows',
      '/attendance/active-entries',
    ]) expect([u, isKeptResponse(u)]).toEqual([u, false]);
  });

  it('a history of CLOCKED_OUT shifts is still kept — the exclusion is presence only', () => {
    expect(isKeptResponse('/attendance/all-entries?startDate=2026-09-01&endDate=2026-09-07&status=CLOCKED_OUT')).toBe(true);
  });

  it('the approvals count reads the summary route, never a page of shifts', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ total: 95, bySpace: { a: 30 } });
    const r = await attendanceApi.pendingApprovalsSummary();
    expect(fetchMock.mock.calls[0][0]).toBe('/attendance/approvals/pending?summary=true');
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
    fetchMock.mockImplementation(async (url: string) => {
      const page = Number(/page=(\d+)/.exec(url)?.[1] ?? 1);
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
