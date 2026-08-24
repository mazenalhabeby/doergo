import { RedisThrottlerStorage } from '../throttler/redis-throttler.storage';

/**
 * Rate limits must be shared across replicas.
 *
 * The default `ThrottlerStorageService` counts in process memory, so N replicas
 * behind a load balancer multiply every limit in the product by N — login,
 * forgot-password, invitation-code validation — silently, because nothing fails.
 * Each replica just counts only the requests that landed on it.
 *
 * The Lua script itself was verified against a live Redis (counter increments,
 * window expiry actually resets the counter, exceeding the limit sets the block,
 * and blocked hits do not keep incrementing). What is asserted here is the
 * wrapper: the millisecond → second conversion the guard depends on, and the
 * failure policy.
 */
describe('RedisThrottlerStorage (shared rate limits)', () => {
  // The client is injected, so no test here opens a socket.
  const build = (evalImpl: jest.Mock) =>
    new RedisThrottlerStorage({ get: () => undefined } as any, {
      eval: evalImpl,
      on: jest.fn(),
      quit: jest.fn().mockResolvedValue(undefined),
    } as any);

  it('converts the script’s milliseconds to the seconds the guard expects', async () => {
    const storage = build(jest.fn().mockResolvedValue([3, 45_000, 0, 0]));
    const rec = await storage.increment('ip', 60_000, 5, 0, 'default');
    expect(rec).toEqual({
      totalHits: 3,
      timeToExpire: 45,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('rounds a sub-second window UP, so the 1s "short" tier never reports 0', async () => {
    const storage = build(jest.fn().mockResolvedValue([1, 400, 0, 0]));
    const rec = await storage.increment('ip', 1000, 10, 0, 'short');
    expect(rec.timeToExpire).toBe(1);
  });

  it('reports a block', async () => {
    const storage = build(jest.fn().mockResolvedValue([9, 30_000, 1, 12_000]));
    const rec = await storage.increment('ip', 60_000, 5, 30_000, 'default');
    expect(rec.isBlocked).toBe(true);
    expect(rec.timeToBlockExpire).toBe(12);
  });

  it('namespaces the keys by throttler, so tiers cannot share a counter', async () => {
    const ev = jest.fn().mockResolvedValue([1, 1000, 0, 0]);
    const storage = build(ev);
    await storage.increment('1.2.3.4', 60_000, 5, 0, 'login');
    const [, numKeys, hitKey, blockKey] = ev.mock.calls[0];
    expect(numKeys).toBe(2);
    expect(hitKey).toBe('throttle:login:1.2.3.4');
    expect(blockKey).toBe('throttle:blk:login:1.2.3.4');
  });

  describe('when Redis is unreachable', () => {
    it('DEGRADES to per-process counting rather than failing the request', async () => {
      const storage = build(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const first = await storage.increment('ip', 60_000, 5, 0, 'default');
      const second = await storage.increment('ip', 60_000, 5, 0, 'default');
      // The fallback registers a timer per window; onModuleDestroy must clear them,
      // or the process (and this test runner) never exits.
      await storage.onModuleDestroy();
      // Still counting — a real limit per replica, which is the behaviour that
      // existed before this class. Failing closed would take the API down because
      // a cache is unavailable; failing open would remove rate limiting during
      // exactly the kind of incident where it matters most.
      expect(first.totalHits).toBe(1);
      expect(second.totalHits).toBe(2);
    });
  });
});
