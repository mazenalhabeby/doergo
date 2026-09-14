/**
 * Offline pull: cursor paging, deletions, and scope membership.
 *
 * Verified end-to-end against the dev database while building it (126 tasks
 * over 26 pages, an incremental pull after that returning nothing, a created
 * task appearing and its deletion arriving through the tombstone trigger).
 * These pin the rules that made the difference.
 */
import { SyncPullService, encodeCursor, decodeCursor } from '../sync-pull.service';

const ORG = 'org_1';
const day = 86_400_000;
const facts = { userId: 'u1', userRole: 'EMPLOYEE', organizationId: ORG };

function prismaWith(tasks: any[], tombstones: any[] = []) {
  return {
    task: {
      findMany: jest.fn(async (args: any) => (args.select?.title ? tasks.slice(0, args.take) : tasks.map((t) => ({ id: t.id })))),
    },
    syncTombstone: {
      findMany: jest.fn(async () => tombstones),
      aggregate: jest.fn(async () => ({ _max: { id: BigInt(41) } })),
    },
    spaceAssignment: { findMany: jest.fn(async () => []) },
  };
}

const task = (id: string, updatedAt = new Date('2026-03-01T10:00:00Z')) => ({ id, updatedAt, title: id });

describe('cursor', () => {
  it('round-trips and refuses anything malformed', () => {
    const c = encodeCursor({ t: '2026-03-01T10:00:00.000Z', i: 't9', d: '41', s: '2026-09-14T10:00:00.000Z' });
    expect(decodeCursor(c)).toMatchObject({ v: 1, t: '2026-03-01T10:00:00.000Z', i: 't9', d: '41' });
    for (const bad of ['', 'not-base64-json', Buffer.from('{"v":2}').toString('base64url'), encodeCursor({ t: 'x', i: '', d: '1', s: 'y' })]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });
});

describe('SyncPullService tasks', () => {
  it('first pull is a reset with the scope membership on the last page', async () => {
    const prisma = prismaWith([task('a'), task('b')]);
    const r = await new SyncPullService(prisma as any).pull({ ...facts, scope: 'tasks' });
    expect(r.reset).toBe(true);
    expect(r.hasMore).toBe(false);
    expect(r.scopeIds).toEqual(['a', 'b']);
    expect(r.deleted).toEqual([]);
    // Watermark starts at the current highest tombstone, so older deletions are not replayed.
    expect(decodeCursor(r.cursor)!.d).toBe('41');
    expect(prisma.syncTombstone.findMany).not.toHaveBeenCalled();
  });

  it('pages without sending membership until the last page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => task(`t${i}`));
    const prisma = prismaWith(rows);
    const r = await new SyncPullService(prisma as any).pull({ ...facts, scope: 'tasks', limit: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.hasMore).toBe(true);
    expect(r.scopeIds).toBeUndefined();
    expect(decodeCursor(r.cursor)).toMatchObject({ i: 't1' });
  });

  it('⚠️ an old scope is not reset: staleness is the cursor age, not the row date', async () => {
    const prisma = prismaWith([task('a', new Date(Date.now() - 200 * day))]);
    const cursor = encodeCursor({ t: new Date(Date.now() - 200 * day).toISOString(), i: 'a', d: '41', s: new Date().toISOString() });
    const r = await new SyncPullService(prisma as any).pull({ ...facts, scope: 'tasks', cursor });
    expect(r.reset).toBe(false);
  });

  it('a phone that has not pulled for longer than the tombstone window rebuilds', async () => {
    const prisma = prismaWith([]);
    const cursor = encodeCursor({ t: '2026-01-01T00:00:00.000Z', i: 'a', d: '1', s: new Date(Date.now() - 120 * day).toISOString() });
    const r = await new SyncPullService(prisma as any).pull({ ...facts, scope: 'tasks', cursor });
    expect(r.reset).toBe(true);
  });

  it('reports deletions since the cursor, scoped to the organization, and advances the watermark', async () => {
    const prisma = prismaWith([], [{ id: BigInt(42), entityId: 'gone1' }, { id: BigInt(47), entityId: 'gone2' }]);
    const cursor = encodeCursor({ t: '2026-09-01T00:00:00.000Z', i: 'a', d: '41', s: new Date().toISOString() });
    const r = await new SyncPullService(prisma as any).pull({ ...facts, scope: 'tasks', cursor });
    expect(r.deleted).toEqual(['gone1', 'gone2']);
    expect((prisma.syncTombstone.findMany.mock.calls as any)[0][0].where).toMatchObject({ entity: 'tasks', organizationId: ORG, id: { gt: BigInt(41) } });
    expect(decodeCursor(r.cursor)!.d).toBe('47');
  });

  it('scopes rows by the task list visibility rule (a member sees only their own work)', async () => {
    const prisma = prismaWith([]);
    await new SyncPullService(prisma as any).pull({ ...facts, scope: 'tasks' });
    const where = (prisma.task.findMany.mock.calls as any)[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(JSON.stringify(where.AND)).toContain('"assignedToId":"u1"');
  });

  it('refuses an unknown scope', async () => {
    await expect(new SyncPullService(prismaWith([]) as any).pull({ ...facts, scope: 'payroll' as any })).rejects.toThrow('Unknown sync scope');
  });
});
