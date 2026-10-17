import { AuthTokenCache } from '../cache/auth-token-cache.service';

import { fakeUser } from '../testing/fake-request';
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
    mget: async (...ks: string[]) => ks.map((k) => values.get(k) ?? null),
    set: async (k: string, v: string) => {
      values.set(k, v);
      return 'OK';
    },
    sadd: async (k: string, m: string) => {
      (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(m);
      return 1;
    },
    expire: async () => 1,
    smembers: async (k: string) => [...(sets.get(k) ?? [])],
    del: async (...keys: string[]) => {
      keys.forEach((k) => {
        values.delete(k);
        sets.delete(k);
      });
      return keys.length;
    },
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

    await cache.set('tok-admin', fakeUser({ id: 'u1', organizationId: 'org-1' }), 60);
    await cache.set('tok-member', fakeUser({ id: 'u2', organizationId: 'org-1' }), 60);
    await cache.set('tok-outsider', fakeUser({ id: 'u3', organizationId: 'org-2' }), 60);

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
    await cache.set('tok', fakeUser({ id: 'u1', organizationId: 'org-1' }), 60);

    expect([...(redis.sets.get('auth:usr:u1') ?? [])]).toHaveLength(1);
    expect([...(redis.sets.get('auth:org:org-1') ?? [])]).toHaveLength(1);
  });

  it('survives a user with no organization', async () => {
    // An orphan — registered, not yet in an organization — must still be cached.
    const redis = fakeRedis();
    const cache = cacheWith(redis);
    await expect(cache.set('tok', fakeUser({ id: 'u9' }), 60)).resolves.toBeUndefined();
    expect(await cache.get('tok')).toEqual({ id: 'u9' });
  });

  it('never throws when Redis is unhappy', async () => {
    /*
      A cache that cannot be cleared must not fail the change that cleared it —
      the entries expire on their own within the TTL regardless, so the worst
      case is the delay we started with, not a refused request.
    */
    const broken = {
      ...fakeRedis(),
      smembers: async () => {
        throw new Error('down');
      },
    };
    const cache = cacheWith(broken as unknown as ReturnType<typeof fakeRedis>);
    await expect(cache.invalidateOrganization('org-1')).resolves.toBeUndefined();
  });
});

/*
  Signing out must end the ACCESS token, not just the refresh token: a JWT is
  valid until `exp`, and clearing the cache alone let the next request simply
  re-validate it (found by testing against the running stack, 2026-10-10).
*/
describe('a signed-out access token', () => {
  it('is refused from the moment of sign-out', async () => {
    const cache = cacheWith(fakeRedis());
    await cache.set('tok-a', fakeUser({ id: 'u1', organizationId: 'org-1' }), 60);
    await cache.revoke('tok-a', 900);
    expect(await cache.lookup('tok-a')).toEqual({ user: null, revoked: true });
    expect(await cache.get('tok-a')).toBeNull();
  });

  it('beats a cache entry written AFTER the sign-out (a request that was mid-validation)', async () => {
    const cache = cacheWith(fakeRedis());
    await cache.revoke('tok-a', 900);
    await cache.set('tok-a', fakeUser({ id: 'u1' }), 60);
    expect((await cache.lookup('tok-a')).revoked).toBe(true);
    expect((await cache.lookup('tok-a')).user).toBeNull();
  });

  it('touches only that token — the member’s other devices stay signed in', async () => {
    const cache = cacheWith(fakeRedis());
    await cache.set('tok-phone', fakeUser({ id: 'u1' }), 60);
    await cache.revoke('tok-web', 900);
    expect(await cache.lookup('tok-phone')).toEqual({ user: { id: 'u1' }, revoked: false });
  });

  it('records nothing for an already-expired token', async () => {
    const redis = fakeRedis();
    await cacheWith(redis).revoke('tok-old', 0);
    expect(redis.values.size).toBe(0);
  });

  it('Redis down: auth falls back to the RPC instead of failing', async () => {
    const cache = cacheWith({
      ...fakeRedis(),
      mget: async () => {
        throw new Error('down');
      },
    } as never);
    expect(await cache.lookup('tok-a')).toEqual({ user: null, revoked: false });
  });
});
