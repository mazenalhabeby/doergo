/**
 * The lock that lets this system run more than one replica.
 *
 * Without it, NestJS runs every @Cron in every instance — so two replicas of
 * auth-service means the nightly billing reconcile writes Stripe subscription
 * lines twice, and a customer reminder mails people twice a minute. These tests
 * are the reason anyone can trust a second replica.
 */
import { runWithCronLock, cronLockOwner } from '@hbcfield/shared';

/**
 * A stand-in for Postgres that honours the one property the real claim relies
 * on: the conditional upsert returns a row only when the lease is free or
 * expired. Everything else about the SQL is Postgres's problem, not this test's.
 */
function fakeDb(clock = { now: 0 }) {
  const leases = new Map<string, { until: number; by: string }>();
  return {
    leases,
    clock,
    async $queryRawUnsafe<T = unknown>(query: string, ...v: unknown[]): Promise<T> {
      if (query.includes('INSERT INTO cron_locks')) {
        const [name, ttl, owner] = v as [string, number, string];
        const held = leases.get(name);
        if (held && held.until > clock.now) return [] as unknown as T; // someone else holds it
        leases.set(name, { until: clock.now + ttl * 1000, by: owner });
        return [{ name }] as unknown as T;
      }
      if (query.includes('UPDATE cron_locks')) {
        const [name, owner] = v as [string, string];
        const held = leases.get(name);
        // Guarded by owner: a job that lost its lease must not release the
        // replica that legitimately took it over.
        if (held && held.by === owner) leases.set(name, { until: clock.now, by: owner });
        return [] as unknown as T;
      }
      throw new Error(`unexpected query: ${query}`);
    },
  };
}

const opts = (name = 'job') => ({ name, ttlSeconds: 60 });

describe('runWithCronLock', () => {
  it('runs the job when the lease is free', async () => {
    const db = fakeDb();
    let ran = 0;
    const did = await runWithCronLock(db, opts(), async () => { ran++; });
    expect(did).toBe(true);
    expect(ran).toBe(1);
  });

  it('lets exactly one of two replicas run — the whole point', async () => {
    const db = fakeDb();
    let ran = 0;
    // Both hold the lease at once: the second must be refused while the first
    // is still inside its job.
    let release!: () => void;
    const blocked = new Promise<void>((r) => { release = r; });

    const a = runWithCronLock(db, opts(), async () => { ran++; await blocked; });
    await new Promise((r) => setImmediate(r));
    const b = await runWithCronLock(db, opts(), async () => { ran++; });

    expect(b).toBe(false);
    release();
    expect(await a).toBe(true);
    expect(ran).toBe(1);
  });

  it('releases the lease when the job throws, so the next tick is not skipped', async () => {
    const db = fakeDb();
    await expect(
      runWithCronLock(db, opts(), async () => { throw new Error('job failed'); }),
    ).rejects.toThrow('job failed');

    let ran = 0;
    expect(await runWithCronLock(db, opts(), async () => { ran++; })).toBe(true);
    expect(ran).toBe(1);
  });

  it('lets another replica take over once a dead one\'s lease expires', async () => {
    const clock = { now: 0 };
    const db = fakeDb(clock);
    // A replica claims it and never returns — the process died mid-job.
    await db.$queryRawUnsafe('INSERT INTO cron_locks', 'job', 60, 'dead-replica');

    let ran = 0;
    expect(await runWithCronLock(db, opts(), async () => { ran++; })).toBe(false);

    clock.now += 61_000; // TTL passes
    expect(await runWithCronLock(db, opts(), async () => { ran++; })).toBe(true);
    expect(ran).toBe(1);
  });

  it('does not take the scheduler down when the lock table is unreachable', async () => {
    const broken = {
      async $queryRawUnsafe(): Promise<never> { throw new Error('connection refused'); },
    };
    let ran = 0;
    // Skipping a tick is bad. A scheduler that dies is worse.
    expect(await runWithCronLock(broken, opts(), async () => { ran++; })).toBe(false);
    expect(ran).toBe(0);
  });

  it('separate jobs do not block each other', async () => {
    const db = fakeDb();
    expect(await runWithCronLock(db, opts('billing:expireTrials'), async () => {})).toBe(true);
    const held = runWithCronLock(db, opts('billing:reconcileUsageDaily'), async () => {});
    expect(await held).toBe(true);
  });

  it('names the replica holding the lease', () => {
    expect(cronLockOwner()).toMatch(/:\d+$/);
  });
});
