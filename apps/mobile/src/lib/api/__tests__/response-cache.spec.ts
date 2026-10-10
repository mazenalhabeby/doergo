import { apiEndpoints as E, type Endpoint } from '@hbcfield/shared/client';
import { keepResponse, keptResponse, setResponseCache, shouldKeep } from '../response-cache';

/** The decision the client hands the cache for one endpoint call: its path and its own verdict. */
function verdict<A>(def: Endpoint<A, any, any>, args: A): [string, boolean] {
  const p = def.path(args);
  const keep = typeof def.keep === 'function' ? def.keep(args) : def.keep;
  return [p, shouldKeep(p, keep)];
}

describe('kept responses', () => {
  it("keeps the member's own data — decided by the endpoint", () => {
    for (const [p, kept] of [
      verdict(E.attendance.history, { limit: 10 }),
      verdict(E.documents.list, undefined),
      verdict(E.assets.mine, undefined),
      verdict(E.assets.myLog, { limit: 50 }),
      verdict(E.assets.dueMine, undefined),
      verdict(E.chat.conversations, undefined),
      verdict(E.timeOff.listFor, { employeeId: 'u1' }),
      verdict(E.shiftIssues.get, { id: 'i1' }),
      verdict(E.customers.list, { page: 1 }),
      verdict(E.portal.config, undefined),
      verdict(E.portal.requests, undefined),
      verdict(E.portal.request, { id: 'r1' }),
      verdict(E.portal.units, undefined),
      verdict(E.attendance.allEntries, { status: 'COMPLETED', limit: 50 }),
    ]) {
      expect([p, kept]).toEqual([p, true]);
    }
  });

  it('never keeps presence, credentials, or what has its own offline copy', () => {
    for (const [p, kept] of [
      verdict(E.tasks.list, undefined),
      verdict(E.tasks.get, { id: 't1' }),
      verdict(E.attendance.status, undefined),
      verdict(E.attendance.breakStatus, undefined),
      verdict(E.worklog.list, { entryId: 'e1' }),
      verdict(E.auth.me, undefined),
      verdict(E.billing.bill, undefined),
      verdict(E.tracking.workers, undefined),
      verdict(E.sync.pull, { scope: 'tasks' as never }),
      // Presence — who is on NOW (the Crew card). Stale is wrong, not old.
      verdict(E.attendance.allEntries, { status: 'CLOCKED_IN', limit: 300 }),
      verdict(E.attendance.activeEntries, undefined),
      verdict(E.attendance.activeBreaks, undefined),
      verdict(E.attendance.noShows, { days: 1 }),
      verdict(E.attendance.pendingApprovals, { summary: true }),
    ]) {
      expect([p, kept]).toEqual([p, false]);
    }
  });

  it('a signed link is never kept, whatever an endpoint says', () => {
    for (const p of ['/documents/d1/download-url', '/assets/proposals/p1/document-url', '/portal/requests/r1/attachments/a1/url', '/tasks/t/attachments/presign']) {
      expect([p, shouldKeep(p, true)]).toEqual([p, false]);
    }
  });

  it('the rota week is never kept (the table says so; the phone also refuses it)', () => {
    const [p, kept] = verdict(E.rota.week, { spaceId: 's1' });
    expect(E.rota.week.keep).toBe(false);
    expect([p, kept]).toEqual([p, false]);
  });

  it('an endpoint the table has not marked is not kept (an allow-list)', () => {
    expect(shouldKeep('/calendar/people', undefined)).toBe(false);
    expect(shouldKeep('/organizations/roles', undefined)).toBe(false);
  });

  it('answers only while a store is plugged in', async () => {
    const map = new Map<string, unknown>();
    expect(await keptResponse('/documents', true)).toBeUndefined();
    setResponseCache({ get: async (k) => map.get(k), put: async (k, v) => void map.set(k, v) });
    keepResponse('/documents', [{ id: 'd1' }], true);
    keepResponse('/auth/me', { id: 'u1' }, false);
    keepResponse('/unmarked', { id: 'x' });
    await Promise.resolve();
    expect(await keptResponse('/documents', true)).toEqual([{ id: 'd1' }]);
    expect(map.has('/auth/me')).toBe(false);
    expect(map.has('/unmarked')).toBe(false);
    setResponseCache(null);
    expect(await keptResponse('/documents', true)).toBeUndefined();
  });
});
