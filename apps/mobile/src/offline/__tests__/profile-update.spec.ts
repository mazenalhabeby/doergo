import { SyncEngine, type RecordsSink } from '../sync-engine';
import { MemoryOutboxStore } from '../outbox/memory-store';
import { updateOwnProfile } from '../profile/profile-actions';

const records: RecordsSink = { async applyPull() {}, async cursor() { return { cursor: null, lastPullAt: null }; } };

describe('changing your own profile offline', () => {
  it('queues a PATCH of just the changed fields on the member’s own lane', async () => {
    let n = 0;
    const e = new SyncEngine({
      userId: 'u1', organizationId: 'o1', store: new MemoryOutboxStore(), records, newId: () => `op-${++n}`,
      transport: { async push() { throw new Error('Network request failed'); }, async pull() { throw new Error('unused'); } },
    });
    await e.start();
    expect((await updateOwnProfile(e, 'u1', { presence: 'BUSY' })).kind).toBe('queued');
    const op = e.operations()[0]!;
    expect(op).toMatchObject({ op: 'profile.update', lane: 'profile:u1', entityId: 'u1', payload: { body: { presence: 'BUSY' } } });
  });
});
