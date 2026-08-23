/**
 * Only one replica runs a scheduled job.
 *
 * NestJS starts a cron in EVERY instance of a process. With one container per
 * service that is invisible; the moment there are two, every schedule fires
 * twice. In this system that means the nightly billing reconcile writing Stripe
 * subscription lines twice, and a customer reminder mailing people twice a
 * minute. It is the reason nothing here can currently be scaled horizontally.
 *
 * WHY A LEASE TABLE AND NOT `pg_advisory_lock`:
 * PgBouncer runs in TRANSACTION pooling mode. A session-level advisory lock is
 * tied to a backend connection, and transaction pooling hands that connection
 * to somebody else the moment the statement finishes — so the lock is released
 * under you, or held by a connection you no longer own. Transaction-scoped
 * (`_xact_`) locks survive pooling but only last the transaction, which is no
 * use for a job that runs for minutes.
 *
 * A row with an expiry works through any pooler, and has two properties worth
 * having: you can SEE who holds what by selecting from it, and a replica that
 * dies mid-job does not jam the schedule forever — the lease simply expires.
 *
 * The claim is ONE statement, so two replicas racing cannot both win: the
 * conditional UPDATE is evaluated under the row lock taken by ON CONFLICT.
 */

/** Just enough of a Prisma client to run the two statements. */
export interface CronLockDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface CronLockLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Identifies the replica holding a lease. Useful when one is stuck. */
export function cronLockOwner(): string {
  return `${process.env.HOSTNAME ?? 'unknown'}:${process.pid}`;
}

const CLAIM = `
  INSERT INTO cron_locks (name, "lockedUntil", "lockedBy", "updatedAt")
  VALUES ($1, now() + make_interval(secs => $2::int), $3, now())
  ON CONFLICT (name) DO UPDATE
     SET "lockedUntil" = now() + make_interval(secs => $2::int),
         "lockedBy"    = $3,
         "updatedAt"   = now()
   WHERE cron_locks."lockedUntil" < now()
  RETURNING name
`;

const RELEASE = `
  UPDATE cron_locks
     SET "lockedUntil" = now(), "lastRunAt" = now(), "updatedAt" = now()
   WHERE name = $1 AND "lockedBy" = $2
`;

/**
 * Run `job` only if this replica can claim the lease.
 *
 * Returns true if it ran here, false if another replica holds it. Never throws
 * on a lock failure — a scheduler that dies because the lock table is briefly
 * unreachable is worse than one that skips a tick.
 *
 * `ttlSeconds` must comfortably exceed the job's worst-case runtime, and for a
 * frequent schedule must be shorter than its interval, or the job locks itself
 * out of its own next tick.
 */
export async function runWithCronLock(
  db: CronLockDb,
  opts: { name: string; ttlSeconds: number; owner?: string; logger?: CronLockLogger },
  job: () => Promise<unknown>,
): Promise<boolean> {
  const owner = opts.owner ?? cronLockOwner();

  let claimed = false;
  try {
    const rows = await db.$queryRawUnsafe<unknown[]>(CLAIM, opts.name, opts.ttlSeconds, owner);
    claimed = Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    opts.logger?.error(`cron lock "${opts.name}" could not be claimed: ${(err as Error).message}`);
    return false;
  }

  if (!claimed) return false;

  try {
    await job();
    return true;
  } finally {
    // Released even when the job throws: the lease is about who is RUNNING it,
    // not about whether it succeeded. Leaving it held would skip every tick
    // until the TTL expired.
    try {
      await db.$queryRawUnsafe(RELEASE, opts.name, owner);
    } catch (err) {
      opts.logger?.warn(`cron lock "${opts.name}" not released, will expire: ${(err as Error).message}`);
    }
  }
}
