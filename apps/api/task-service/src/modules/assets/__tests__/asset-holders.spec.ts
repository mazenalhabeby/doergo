import { BadRequestException } from '@nestjs/common';
import { AssetHoldersService } from '../asset-holders.service';

/**
 * Who may hold a thing, and how many.
 *
 * The picker only ever offers what the kind allows — which is worth nothing on
 * its own, because a request does not have to come from the picker. Every rule
 * below is the server's, tested through the real class with a stub client so
 * that deleting the rule fails the test rather than passing a copy of it.
 */
const ORG = 'org_1';

const SINGLE = { holder: { enabled: true, label: 'Driver', members: true, clients: false, multiple: false } };
const MANY = { holder: { enabled: true, label: 'Resident', members: true, clients: true, multiple: true } };
const NO_HOLDER = { holder: { enabled: false } };
const CLIENTS_ONLY = { holder: { enabled: true, label: 'Tenant', members: false, clients: true, multiple: true } };

/** A stub that answers only for ids belonging to `inOrg`. */
function service(inOrg: { users?: string[]; customers?: string[] } = {}) {
  const users = new Set(inOrg.users ?? []);
  const customers = new Set(inOrg.customers ?? []);
  const prisma: any = {
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        where.id.in.filter((id: string) => users.has(id) && where.organizationId === ORG).map((id: string) => ({ id })),
      ),
    },
    customer: {
      findMany: jest.fn(async ({ where }: any) =>
        where.id.in.filter((id: string) => customers.has(id) && where.organizationId === ORG).map((id: string) => ({ id })),
      ),
    },
  };
  return { svc: new AssetHoldersService(prisma), prisma };
}

describe('resolving who holds an asset', () => {
  it('accepts several when the kind says several', async () => {
    const { svc } = service({ users: ['u1', 'u2'], customers: ['c1'] });
    const rows = await svc.resolve([{ userId: 'u1' }, { userId: 'u2' }, { customerId: 'c1' }], ORG, MANY);
    expect(rows).toHaveLength(3);
  });

  it('refuses a second one when the kind says one', async () => {
    const { svc } = service({ users: ['u1', 'u2'] });
    await expect(svc.resolve([{ userId: 'u1' }, { userId: 'u2' }], ORG, SINGLE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // and the message says what to do about it
    await expect(svc.resolve([{ userId: 'u1' }, { userId: 'u2' }], ORG, SINGLE)).rejects.toThrow(/one at a time/i);
  });

  it('accepts exactly one when the kind says one', async () => {
    const { svc } = service({ users: ['u1'] });
    await expect(svc.resolve([{ userId: 'u1' }], ORG, SINGLE)).resolves.toEqual([{ userId: 'u1', customerId: null }]);
  });

  it("refuses somebody from another organization, however the id was obtained", async () => {
    const { svc } = service({ users: ['u1'] });
    await expect(svc.resolve([{ userId: 'u1' }, { userId: 'someone_elses' }], ORG, MANY)).rejects.toThrow(
      /not in this organization/i,
    );
  });

  it('refuses a client id when the kind is held by members', async () => {
    const { svc } = service({ customers: ['c1'] });
    await expect(svc.resolve([{ customerId: 'c1' }], ORG, SINGLE)).rejects.toThrow(/members, not clients/i);
  });

  it('refuses a member id when the kind is held by clients', async () => {
    const { svc } = service({ users: ['u1'] });
    await expect(svc.resolve([{ userId: 'u1' }], ORG, CLIENTS_ONLY)).rejects.toThrow(/clients, not members/i);
  });

  it('refuses an entry that names both — it would be held by two people at once', async () => {
    const { svc } = service({ users: ['u1'], customers: ['c1'] });
    await expect(svc.resolve([{ userId: 'u1', customerId: 'c1' }], ORG, MANY)).rejects.toThrow(/not both/i);
  });

  it('gives a kind with no holder nobody, whatever the request says', async () => {
    const { svc, prisma } = service({ users: ['u1'] });
    await expect(svc.resolve([{ userId: 'u1' }], ORG, NO_HOLDER)).resolves.toEqual([]);
    // and does not go to the database to find that out
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('treats the same person listed twice as once', async () => {
    const { svc } = service({ users: ['u1'] });
    // Also proves the cap is applied to the DEDUPED count: two of the same
    // person on a single-holder kind is a slip, not an attempt at two.
    await expect(svc.resolve([{ userId: 'u1' }, { userId: 'u1' }], ORG, SINGLE)).resolves.toEqual([
      { userId: 'u1', customerId: null },
    ]);
  });

  it('checks the whole list in two queries, not one per holder', async () => {
    const { svc, prisma } = service({ users: ['u1', 'u2', 'u3'], customers: ['c1', 'c2'] });
    await svc.resolve(
      [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }, { customerId: 'c1' }, { customerId: 'c2' }],
      ORG,
      MANY,
    );
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
  });

  it('refuses more than the hard cap however permissive the kind', async () => {
    const many = Array.from({ length: AssetHoldersService.hardCap + 1 }, (_, i) => ({ userId: `u${i}` }));
    const { svc } = service({ users: many.map((h) => h.userId) });
    await expect(svc.resolve(many, ORG, MANY)).rejects.toThrow(/at most/i);
  });

  it('ignores blank and malformed entries rather than storing a holder who is nobody', async () => {
    const { svc } = service({ users: ['u1'] });
    await expect(
      svc.resolve([{ userId: '  ' }, { customerId: '' }, {} as never, { userId: 'u1' }], ORG, MANY),
    ).resolves.toEqual([{ userId: 'u1', customerId: null }]);
  });
});

describe('requests that still speak the old single-holder language', () => {
  it('folds one holderUserId into a list', () => {
    expect(AssetHoldersService.fromLegacy({ holderUserId: 'u1' })).toEqual([{ userId: 'u1' }]);
    expect(AssetHoldersService.fromLegacy({ customerId: 'c1' })).toEqual([{ customerId: 'c1' }]);
  });

  it('lets the new field win when both arrive', () => {
    expect(AssetHoldersService.fromLegacy({ holders: [{ userId: 'u2' }], holderUserId: 'u1' })).toEqual([
      { userId: 'u2' },
    ]);
  });

  it('keeps "said nothing" apart from "clear it"', () => {
    // The distinction that stops every rename from wiping the residents.
    expect(AssetHoldersService.fromLegacy({})).toBeUndefined();
    expect(AssetHoldersService.fromLegacy({ holderUserId: null })).toEqual([]);
    expect(AssetHoldersService.fromLegacy({ holders: [] })).toEqual([]);
  });
});
