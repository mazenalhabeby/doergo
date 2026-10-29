import { resolveOwnedTaskRefs } from '../core/task-scope';

/*
  A CUSTOMER session without a customerId holds NOTHING.

  `customerId: portal.customerId || undefined` dropped the filter when the id was
  null, so such a session's request could name any unit or asset of the
  organization and it was accepted as theirs.
*/

const ORG = 'org-1';

function prisma() {
  return {
    customerUnit: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
    asset: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) },
    customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
  } as any;
}

describe('portal refs for a session without a client', () => {
  it('a unit and an asset resolve to nothing — no query without the client filter', async () => {
    const db = prisma();
    const out = await resolveOwnedTaskRefs(db, ORG, { unitId: 'u1', assetId: 'a1' }, { customerId: null });
    expect(out).toEqual({ unitId: null, assetId: null });
    expect(db.customerUnit.findFirst).not.toHaveBeenCalled();
    expect(db.asset.findFirst).not.toHaveBeenCalled();
  });

  it('a client session is filtered by its own client', async () => {
    const db = prisma();
    const out = await resolveOwnedTaskRefs(db, ORG, { unitId: 'u1', assetId: 'a1' }, { customerId: 'c1' });
    expect(out).toEqual({ unitId: 'u1', assetId: 'a1' });
    expect(db.customerUnit.findFirst.mock.calls[0][0].where.customerId).toBe('c1');
    expect(db.asset.findFirst.mock.calls[0][0].where.customerId).toBe('c1');
  });
});
