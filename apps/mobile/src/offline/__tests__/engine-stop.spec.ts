import { SyncEngine } from '../sync-engine';

/*
  Sign-out closes and deletes the database right after the engine stops. A push
  or pull still on its way must finish first, and nothing new may start — or its
  next statement runs on a closed connection ("Access to closed resource").
*/
describe('SyncEngine.stop', () => {
  const engine = (pull: () => Promise<any>) =>
    new SyncEngine({
      userId: 'u1',
      organizationId: 'o1',
      store: { list: async () => [], save: async () => undefined, prune: async () => undefined } as any,
      transport: { push: jest.fn(), pull } as any,
      records: { cursor: async () => ({ cursor: null }), applyPull: jest.fn(async () => undefined) } as any,
      newId: () => 'id',
    });

  it('waits for a pull in flight, and the pull stops after its current page', async () => {
    let release!: () => void;
    const pull = jest.fn(() => new Promise((r) => { release = () => r({ cursor: 'c', hasMore: true, records: [] }); }));
    const e = engine(pull);
    const pulling = e.pull('tasks' as any);
    await Promise.resolve();
    let stopped = false;
    const stopping = e.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stopping;
    await pulling;
    expect(stopped).toBe(true);
    expect(pull).toHaveBeenCalledTimes(1); // hasMore was true, but no second page after stop
  });

  it('starts nothing once stopped', async () => {
    const pull = jest.fn(async () => ({ cursor: null, hasMore: false, records: [] }));
    const e = engine(pull);
    await e.stop();
    await e.pull('tasks' as any);
    await e.flush();
    expect(pull).not.toHaveBeenCalled();
  });
});
