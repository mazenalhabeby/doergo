import { DepartureReminderService } from '../departure-reminder.service';

/**
 * Telling a member to set off, when the phone is in their pocket.
 *
 * The task screen already counts down, but somebody reading the task screen has
 * already remembered. This sweep is the half that helps when they have not, so
 * what matters is that it speaks at the right moment, once, and stays quiet
 * when it would otherwise be guessing.
 */
const AT = (iso: string) => new Date(iso);

/** A task as the sweep's own `select` returns it. */
const task = (over: Record<string, any> = {}) => ({
  id: 't1',
  title: 'Meet client — REWE',
  dueDate: AT('2026-09-10T13:00:00Z'),
  assignedToId: 'u1',
  locationLat: 48.2,
  locationLng: 16.37,
  organizationId: 'org1',
  space: { timezone: 'UTC' },
  ...over,
});

function harness(opts: {
  tasks?: any[];
  positions?: any[];
  /** Simulates another replica having already claimed the row. */
  claimed?: boolean;
} = {}) {
  const emitted: any[] = [];
  const updates: any[] = [];
  const prisma = {
    task: {
      findMany: jest.fn(async () => opts.tasks ?? [task()]),
      updateMany: jest.fn(async (args: any) => {
        updates.push(args);
        return { count: opts.claimed === false ? 0 : 1 };
      }),
    },
    workerLastLocation: {
      findMany: jest.fn(async () => opts.positions ?? [
        // ~9km from the task: roughly 15 minutes once inflated for roads.
        { userId: 'u1', lat: 48.28, lng: 16.37, updatedAt: AT('2026-09-10T11:50:00Z') },
      ]),
    },
  };
  const client = { emit: (pattern: string, payload: any) => emitted.push({ pattern, payload }) };
  const svc = new DepartureReminderService(prisma as any, client as any);
  return { svc, prisma, emitted, updates };
}

describe('the departure sweep', () => {
  it('speaks when the moment to leave arrives', async () => {
    const { svc, emitted } = harness();
    // 13:00 appointment, ~15 min drive, 5 min prep → leave about 12:40.
    const sent = await svc.sweep(AT('2026-09-10T12:38:00Z'));
    expect(sent).toBe(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].pattern).toBe('task_departure_due');
    expect(emitted[0].payload.userId).toBe('u1');
    expect(emitted[0].payload.taskId).toBe('t1');
    expect(emitted[0].payload.estimated).toBe(true);
  });

  it('stays quiet while there is still plenty of time', async () => {
    const { svc, emitted } = harness();
    expect(await svc.sweep(AT('2026-09-10T08:00:00Z'))).toBe(0);
    expect(emitted).toHaveLength(0);
  });

  /*
    ⚠️ Midnight is the "no time given" value that every task created before
    appointment times carries. Announcing those would tell the whole customer
    base to set off the previous evening.
  */
  it('ignores a job that has a date but no hour', async () => {
    const { svc, emitted } = harness({ tasks: [task({ dueDate: AT('2026-09-10T00:00:00Z') })] });
    expect(await svc.sweep(AT('2026-09-09T22:00:00Z'))).toBe(0);
    expect(emitted).toHaveLength(0);
  });

  /*
    An estimate is the whole message. "Leave now" with an invented drive time is
    worse than silence — and the card on the task screen still works, because
    the phone knows its own position even when the server's copy is stale.
  */
  it('says nothing when it does not know where the member is', async () => {
    const { svc, emitted } = harness({ positions: [] });
    expect(await svc.sweep(AT('2026-09-10T12:38:00Z'))).toBe(0);
    expect(emitted).toHaveLength(0);
  });

  /*
    The cron lock makes a second replica unlikely, not impossible. Claiming the
    row before speaking is what makes "unlikely" safe: whoever's write lands
    first is the one that sends.
  */
  it('claims the task before announcing it', async () => {
    const { svc, updates, emitted } = harness();
    await svc.sweep(AT('2026-09-10T12:38:00Z'));
    expect(updates[0].where).toEqual({ id: 't1', departureNotifiedAt: null });
    expect(emitted).toHaveLength(1);
  });

  it('does not send when another replica claimed it first', async () => {
    const { svc, emitted } = harness({ claimed: false });
    expect(await svc.sweep(AT('2026-09-10T12:38:00Z'))).toBe(0);
    expect(emitted).toHaveLength(0);
  });

  it('reads every member position in one query, not one per task', async () => {
    const { svc, prisma } = harness({
      tasks: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })],
    });
    await svc.sweep(AT('2026-09-10T12:38:00Z'));
    expect(prisma.workerLastLocation.findMany).toHaveBeenCalledTimes(1);
  });

  it('asks the database for candidates rather than filtering in memory', async () => {
    const { svc, prisma } = harness();
    await svc.sweep(AT('2026-09-10T12:38:00Z'));
    const where = (prisma.task.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.departureNotifiedAt).toBeNull();
    expect(where.assignedToId).toEqual({ not: null });
    // Bounded, so the scan cannot grow with the table for ever.
    expect(where.dueDate.lte).toBeInstanceOf(Date);
    // Work already under way needs no telling to set off.
    expect(where.status.in).not.toContain('EN_ROUTE');
    expect(where.status.in).not.toContain('COMPLETED');
  });

  it('does nothing at all when there are no candidates', async () => {
    const { svc, prisma } = harness({ tasks: [] });
    expect(await svc.sweep(AT('2026-09-10T12:38:00Z'))).toBe(0);
    // Not even the position lookup — the cheap path stays cheap.
    expect(prisma.workerLastLocation.findMany).not.toHaveBeenCalled();
  });

  /*
    The site's clock decides whether a due date is an appointment. 23:00 UTC is
    midnight in a zone one hour ahead — a date-only job there, not an 11pm one.
  */
  it('judges "has an hour" in the site\'s zone', async () => {
    const { svc, emitted } = harness({
      tasks: [task({ dueDate: AT('2026-09-09T23:00:00Z'), space: { timezone: 'Europe/Vienna' } })],
    });
    await svc.sweep(AT('2026-09-09T21:00:00Z'));
    expect(emitted).toHaveLength(0);
  });
});
