import { NotificationRoutingService } from '../notification-routing.service';

/**
 * The routing cache made a change to "Notifications about <member>" take up to
 * 60 seconds to apply: an admin saved, watched the next event go to the old
 * recipients, and reasonably concluded it had not worked.
 *
 * These pin the invalidation that replaced that wait — in particular that it
 * drops the right keys and nothing else, since over-invalidating quietly gives
 * back the query cost the cache exists to avoid.
 */
describe('NotificationRoutingService.invalidate', () => {
  const seed = (svc: NotificationRoutingService, keys: string[]) => {
    const cache = (svc as any).cache as Map<string, unknown>;
    cache.clear();
    for (const k of keys) cache.set(k, { v: { ids: [], emails: [] }, exp: Date.now() + 60_000 });
    return cache;
  };

  const KEYS = [
    'org1:alice:attendance:false',
    'org1:alice:attendance:true',
    'org1:alice:task:false',
    'org1:bob:attendance:false',
    'org2:alice:attendance:false',
  ];

  it('drops every cached category and variant for one subject', () => {
    const svc = new NotificationRoutingService({} as any);
    const cache = seed(svc, KEYS);
    expect(svc.invalidate('org1', 'alice')).toBe(3);
    expect([...cache.keys()]).toEqual(['org1:bob:attendance:false', 'org2:alice:attendance:false']);
  });

  it('leaves the same subject in another organization alone', () => {
    const svc = new NotificationRoutingService({} as any);
    const cache = seed(svc, KEYS);
    svc.invalidate('org1', 'alice');
    expect(cache.has('org2:alice:attendance:false')).toBe(true);
  });

  it('drops a whole organization when no subject is given', () => {
    const svc = new NotificationRoutingService({} as any);
    const cache = seed(svc, KEYS);
    expect(svc.invalidate('org1')).toBe(4);
    expect([...cache.keys()]).toEqual(['org2:alice:attendance:false']);
  });

  it('does not match a subject id that merely starts the same', () => {
    // 'alice' must not invalidate 'alice2' — the prefix ends with ':' for this.
    const svc = new NotificationRoutingService({} as any);
    const cache = seed(svc, ['org1:alice:attendance:false', 'org1:alice2:attendance:false']);
    svc.invalidate('org1', 'alice');
    expect([...cache.keys()]).toEqual(['org1:alice2:attendance:false']);
  });

  it('is a no-op for an organization with nothing cached', () => {
    const svc = new NotificationRoutingService({} as any);
    seed(svc, KEYS);
    expect(svc.invalidate('org-none')).toBe(0);
  });
});
