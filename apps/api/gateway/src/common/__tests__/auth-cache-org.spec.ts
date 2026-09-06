import { AuthTokenCache } from '../cache/auth-token-cache.service';

/*
  Switching an Option off has to be visible at the next request, not somewhere
  inside the next minute.

  `orgAddOns` rides on the cached, validated user, so the navigation went on
  offering Invoices after the Option was removed — and a hard refresh did not
  help, because the staleness is on the SERVER. The per-user index could not fix
  it either: this change is the ORGANIZATION's, and belongs to everybody in it at
  once.
*/

/** A Redis double that records what was asked of it. */
function fakeRedis() {
  const sets = new Map<string, Set<string>>();
  const values = new Map<string, string>();
  return {
    sets,
    values,
    on: () => undefined,
    get: async (k: string) => values.get(k) ?? null,
    set: async (k: string, v: string) => { values.set(k, v); return 'OK'; },
    sadd: async (k: string, m: string) => { (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(m); return 1; },
    expire: async () => 1,
    smembers: async (k: string) => [...(sets.get(k) ?? [])],
    del: async (...keys: string[]) => { keys.forEach((k) => { values.delete(k); sets.delete(k); }); return keys.length; },
  };
}

function cacheWith(redis: ReturnType<typeof fakeRedis>) {
  const cache = Object.create(AuthTokenCache.prototype) as AuthTokenCache;
  (cache as unknown as { redis: unknown }).redis = redis;
  (cache as unknown as { ttl: number }).ttl = 60;
  return cache;
}

describe('clearing a whole organization', () => {
  it('drops every member’s cached session at once', async () => {
    const redis = fakeRedis();
    const cache = cacheWith(redis);

    await cache.set('tok-admin', { id: 'u1', organizationId: 'org-1' }, 60);
    await cache.set('tok-member', { id: 'u2', organizationId: 'org-1' }, 60);
    await cache.set('tok-outsider', { id: 'u3', organizationId: 'org-2' }, 60);

    await cache.invalidateOrganization('org-1');

    expect(await cache.get('tok-admin')).toBeNull();
    expect(await cache.get('tok-member')).toBeNull();
    // Another organization's members are not collateral.
    expect(await cache.get('tok-outsider')).not.toBeNull();
  });

  it('indexes by organization at the same moment as by user', async () => {
    // Written on the way IN, so the invalidation costs one SMEMBERS and one DEL
    // rather than a query for every member and a round trip each.
    const redis = fakeRedis();
    const cache = cacheWith(redis);
    await cache.set('tok', { id: 'u1', organizationId: 'org-1' }, 60);

    expect([...(redis.sets.get('auth:usr:u1') ?? [])]).toHaveLength(1);
    expect([...(redis.sets.get('auth:org:org-1') ?? [])]).toHaveLength(1);
  });

  it('survives a user with no organization', async () => {
    // An orphan — registered, not yet in an organization — must still be cached.
    const redis = fakeRedis();
    const cache = cacheWith(redis);
    await expect(cache.set('tok', { id: 'u9' }, 60)).resolves.toBeUndefined();
    expect(await cache.get('tok')).toEqual({ id: 'u9' });
  });

  it('never throws when Redis is unhappy', async () => {
    /*
      A cache that cannot be cleared must not fail the change that cleared it —
      the entries expire on their own within the TTL regardless, so the worst
      case is the delay we started with, not a refused request.
    */
    const broken = { ...fakeRedis(), smembers: async () => { throw new Error('down'); } };
    const cache = cacheWith(broken as unknown as ReturnType<typeof fakeRedis>);
    await expect(cache.invalidateOrganization('org-1')).resolves.toBeUndefined();
  });
});
