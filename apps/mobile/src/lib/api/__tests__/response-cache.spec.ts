import { isKeptResponse, keepResponse, keptResponse, setResponseCache } from '../response-cache';

describe('kept responses', () => {
  it("keeps the member's own data, never credentials, live data or what has its own offline copy", () => {
    for (const kept of ['/attendance/history?limit=10', '/documents', '/assets/mine', '/assets/log/mine?limit=50', '/assets/log/due-mine', '/chat/conversations', '/employees/u1/time-off', '/shift-issues/i1/messages', '/customers?page=1', '/portal/config', '/portal/requests', '/portal/requests/r1', '/portal/units']) {
      expect([kept, isKeptResponse(kept)]).toEqual([kept, true]);
    }
    for (const never of [
      '/tasks', '/tasks/t1', '/attendance/status', '/attendance/breaks/status', '/attendance/entries/e1/worklog',
      '/auth/me', '/billing/bill', '/tracking/workers', '/sync/pull?scope=tasks', '/documents/d1/download-url', '/assets/proposals/p1/document-url', '/portal/requests/r1/attachments/a1/url',
    ]) {
      expect([never, isKeptResponse(never)]).toEqual([never, false]);
    }
  });

  it('answers only while a store is plugged in', async () => {
    const map = new Map<string, unknown>();
    expect(await keptResponse('/documents')).toBeUndefined();
    setResponseCache({ get: async (k) => map.get(k), put: async (k, v) => void map.set(k, v) });
    keepResponse('/documents', [{ id: 'd1' }]);
    keepResponse('/auth/me', { id: 'u1' });
    await Promise.resolve();
    expect(await keptResponse('/documents')).toEqual([{ id: 'd1' }]);
    expect(map.has('/auth/me')).toBe(false);
    setResponseCache(null);
    expect(await keptResponse('/documents')).toBeUndefined();
  });
});
