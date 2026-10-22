import { SearchController } from '../search.controller';

/**
 * The command palette's search. Its rules: fewer than two characters (after
 * trimming) asks nobody; the text is capped at 100; tasks come from the task
 * gate (who may see which task is decided there — task-actor.spec); people,
 * workspaces' clients are searched only for somebody who views all tasks; a
 * slow or failing half answers with nothing and never fails the search; and
 * the answer carries only the few fields the palette draws.
 */
const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  role: 'MANAGER',
  organizationId: 'org-1',
  canViewAllTasks: true,
  access: { org: { canViewAllTasks: true }, perSpace: {} },
  ...over,
});
const req = (u: Record<string, unknown> | null = user()) => ({ user: u, method: 'GET' }) as any;

function setup() {
  const task = { ask: jest.fn().mockResolvedValue({ tasks: [], spaces: [] }) };
  const auth = { ask: jest.fn().mockResolvedValue({ members: [], customers: [] }) };
  return { task, auth, search: new SearchController({ task, auth } as any) };
}

const EMPTY = { tasks: [], members: [], spaces: [], customers: [] };

describe('global search', () => {
  it.each(['', ' a ', undefined])('asks nobody for %p', async (q) => {
    const { task, auth, search } = setup();
    expect(await search.search(q as any, req())).toEqual(EMPTY);
    expect(task.ask).not.toHaveBeenCalled();
    expect(auth.ask).not.toHaveBeenCalled();
  });

  it('asks nobody without an organization', async () => {
    const { task, search } = setup();
    expect(await search.search('pump', req(user({ organizationId: undefined })))).toEqual(EMPTY);
    expect(task.ask).not.toHaveBeenCalled();
  });

  it('trims and caps the text at 100 characters, six results a kind, 4 s a half', async () => {
    const { task, auth, search } = setup();
    await search.search(`  ${'x'.repeat(300)}  `, req());
    const [, taskPayload, taskOpts] = task.ask.mock.calls[0];
    expect(taskPayload.query).toHaveLength(100);
    expect(taskPayload.limit).toBe(6);
    expect(taskOpts).toEqual({ timeoutMs: 4000 });
    expect(auth.ask.mock.calls[0][1]).toEqual({ query: 'x'.repeat(100), organizationId: 'org-1', limit: 6 });
  });

  it("tasks are asked as the caller (the task gate's own facts), never by organization alone", async () => {
    const { task, search } = setup();
    await search.search('pump', req());
    expect(task.ask.mock.calls[0][1]).toMatchObject({ userId: 'u1', organizationId: 'org-1' });
  });

  it('people and clients only for somebody who views all tasks', async () => {
    const { auth, task, search } = setup();
    await search.search(
      'pump',
      req(user({ canViewAllTasks: false, role: 'EMPLOYEE', access: { org: {}, perSpace: {} } })),
    );
    expect(auth.ask).not.toHaveBeenCalled();
    expect(task.ask).toHaveBeenCalledTimes(1);
  });

  it('a failing half answers with nothing; the other half still arrives', async () => {
    const { task, auth, search } = setup();
    task.ask.mockRejectedValueOnce(new Error('timeout'));
    auth.ask.mockResolvedValueOnce({ members: [{ id: 'm1', firstName: 'Anna' }], customers: [] });
    const res = await search.search('anna', req());
    expect(res.tasks).toEqual([]);
    expect(res.members).toEqual([{ id: 'm1', firstName: 'Anna', lastName: '', email: null, avatarUrl: null }]);
  });

  it('carries only the fields the palette draws, from a list or a paged answer', async () => {
    const { task, auth, search } = setup();
    task.ask.mockResolvedValueOnce({
      tasks: { data: [{ id: 't1', title: 'Pump', status: 'NEW', description: 'secret', organizationId: 'org-1' }] },
      spaces: [{ id: 's1', name: 'Depot', lat: 47, geofencePolygon: [] }],
    });
    auth.ask.mockResolvedValueOnce({
      members: { items: [{ id: 'm1', firstName: 'A', lastName: 'B', email: 'a@b.c', passwordHash: 'x', phone: '1' }] },
      customers: [{ id: 'c1', name: 'BILLA AG', contactName: 'Eva', phone: '2', notes: 'n' }],
    });
    expect(await search.search('pump', req())).toEqual({
      tasks: [{ id: 't1', title: 'Pump', status: 'NEW' }],
      members: [{ id: 'm1', firstName: 'A', lastName: 'B', email: 'a@b.c', avatarUrl: null }],
      spaces: [{ id: 's1', name: 'Depot', address: null }],
      customers: [{ id: 'c1', name: 'BILLA AG', contactName: 'Eva' }],
    });
  });
});
