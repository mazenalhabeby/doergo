import { BadRequestException } from '@nestjs/common';
import {
  warrantyState,
  assetDateProblems,
  canManageAssetsIn,
  assetManageSpaces,
  isSelectableAsset,
  SELECTABLE_ASSET_WHERE,
  BILLABLE_ASSET_WHERE,
} from '@hbcfield/shared';
import { AssetsService } from '../assets.service';
import { AssetAccessService } from '../asset-access.service';

/**
 * The record's own facts: its status, its plate, its dates.
 *
 * All of them sat on the table from the first migration with nothing writing
 * them. Now a form does, so the server has to be the one that refuses a status
 * that is not one of the four, a warranty that ends before the install, and a
 * list that leads with records nobody uses any more.
 */

function setup(stored: Record<string, unknown> = {}) {
  const prisma: any = {
    asset: {
      findUnique: jest.fn(async () => ({
        id: 'a1', organizationId: 'org1', categoryId: null, details: [],
        installDate: null, warrantyExpiry: null, ...stored,
      })),
      findUniqueOrThrow: jest.fn(async () => ({ id: 'a1', organizationId: 'org1', holders: [] })),
      create: jest.fn(async ({ data }: any) => ({ id: 'a1', organizationId: 'org1', holders: [], ...data })),
      update: jest.fn(async () => ({ id: 'a1' })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    user: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const holders: any = { resolve: jest.fn(async () => []), limitFor: jest.fn(() => 1) };
  const service = new AssetsService(
    prisma,
    new AssetAccessService(prisma),
    { logHolderChange: jest.fn() } as any,
    holders,
    { apply: jest.fn() } as any,
  );
  return { service, prisma };
}

const admin = { userId: 'u', userRole: 'ADMIN', organizationId: 'org1' };

describe('status on the record', () => {
  it('stores a status chosen on the form', async () => {
    const { service, prisma } = setup();
    await service.update({ id: 'a1', status: 'MAINTENANCE', ...admin });
    expect(prisma.asset.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: 'MAINTENANCE' }));
  });

  it('refuses a status that is not one of the four, before anything is read', async () => {
    const { service, prisma } = setup();
    await expect(service.update({ id: 'a1', status: 'SOLD', ...admin })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ name: 'Van', status: 'retired', ...admin })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.asset.findUnique).not.toHaveBeenCalled();
    expect(prisma.asset.create).not.toHaveBeenCalled();
  });
});

describe('the list can leave retired records out', () => {
  it('hides RETIRED when asked to', async () => {
    const { service, prisma } = setup();
    await service.findAll({ hideRetired: 'true', ...admin });
    expect(prisma.asset.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ status: { not: 'RETIRED' } }),
    );
  });

  it('an explicit status wins — asking for RETIRED returns them', async () => {
    const { service, prisma } = setup();
    await service.findAll({ hideRetired: 'true', status: 'RETIRED', ...admin });
    expect(prisma.asset.findMany.mock.calls[0][0].where.status).toBe('RETIRED');
  });

  it('changes nothing for a caller that did not ask', async () => {
    // Opt-in: an existing caller written against "everything" keeps it.
    const { service, prisma } = setup();
    await service.findAll({ ...admin });
    expect(prisma.asset.findMany.mock.calls[0][0].where).not.toHaveProperty('status');
    await service.findAll({ hideRetired: 'false', ...admin });
    expect(prisma.asset.findMany.mock.calls[1][0].where).not.toHaveProperty('status');
  });

  it('picks by the same rule billing counts by, today', () => {
    expect(SELECTABLE_ASSET_WHERE).toEqual(BILLABLE_ASSET_WHERE);
    expect(isSelectableAsset({ status: 'RETIRED' })).toBe(false);
    expect(isSelectableAsset({ status: 'MAINTENANCE' })).toBe(true);
  });
});

describe('dates on the plate', () => {
  it('refuses a warranty ending before the install, on create', async () => {
    const { service } = setup();
    await expect(
      service.create({ name: 'Press', installDate: '2026-05-01', warrantyExpiry: '2025-05-01', ...admin }),
    ).rejects.toThrow('The warranty cannot end before the date it was installed');
  });

  /*
    ⚠️ Asked of what the record WILL hold. A partial update carrying only the
    warranty must still be compared with the install date already stored —
    otherwise the second edit lets the typo through.
  */
  it('compares a partial update with the date already stored', async () => {
    const { service, prisma } = setup({ installDate: new Date('2026-05-01') });
    await expect(service.update({ id: 'a1', warrantyExpiry: '2025-05-01', ...admin })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.asset.update).not.toHaveBeenCalled();
  });

  it('clears a date sent as null, and the pair is then fine', async () => {
    const { service, prisma } = setup({ installDate: new Date('2026-05-01'), warrantyExpiry: new Date('2027-05-01') });
    await service.update({ id: 'a1', installDate: null, warrantyExpiry: '2020-01-01', serialNumber: null, ...admin });
    expect(prisma.asset.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ installDate: null, warrantyExpiry: new Date('2020-01-01'), serialNumber: null }),
    );
  });

  it('names what is wrong with the pair', () => {
    expect(assetDateProblems({ installDate: 'nope' })).toEqual(['install-invalid']);
    expect(assetDateProblems({ installDate: '2026-01-01', warrantyExpiry: '2027-01-01' })).toEqual([]);
    expect(assetDateProblems({ installDate: null, warrantyExpiry: '' })).toEqual([]);
  });
});

describe('where a warranty stands', () => {
  const now = new Date('2026-09-15T12:00:00Z');

  it('says nothing when there is none', () => {
    expect(warrantyState(null, now)).toBeNull();
    expect(warrantyState('', now)).toBeNull();
  });

  it('is expiring inside thirty days', () => {
    expect(warrantyState('2026-10-10', now)).toBe('soon');
    expect(warrantyState('2026-12-31', now)).toBe('ok');
  });

  it('still covers the expiry day itself', () => {
    // A warranty ending on the 15th covers a repair on the 15th.
    expect(warrantyState('2026-09-15', now)).toBe('soon');
    expect(warrantyState('2026-09-14', now)).toBe('expired');
  });
});

describe('who may manage assets, and where', () => {
  const spaceRole = (spaceId: string, perms: Record<string, boolean>) => ({
    role: 'EMPLOYEE',
    canManageAssets: false,
    access: { org: {}, perSpace: { [spaceId]: perms } },
  });

  it('is everywhere for an admin and for the org-wide permission', () => {
    expect(assetManageSpaces({ role: 'ADMIN' })).toBeNull();
    expect(assetManageSpaces({ role: 'EMPLOYEE', canManageAssets: true })).toBeNull();
    expect(canManageAssetsIn({ role: 'EMPLOYEE', canManageAssets: true }, 'any')).toBe(true);
  });

  it('is a Space Manager’s own workspace — and nowhere else', () => {
    const user = spaceRole('depot-linz', { canManageAssets: true });
    expect(assetManageSpaces(user)).toEqual(['depot-linz']);
    expect(canManageAssetsIn(user, 'depot-linz')).toBe(true);
    expect(canManageAssetsIn(user, 'depot-graz')).toBe(false);
    // "Anywhere?" — for an entry point that then lists only their own kinds.
    expect(canManageAssetsIn(user)).toBe(true);
  });

  it('is nowhere for somebody who merely oversees the work', () => {
    const user = spaceRole('depot-linz', { canViewAllTasks: true });
    expect(assetManageSpaces(user)).toEqual([]);
    expect(canManageAssetsIn(user, 'depot-linz')).toBe(false);
    expect(canManageAssetsIn(user)).toBe(false);
    expect(canManageAssetsIn(null, 'depot-linz')).toBe(false);
  });

  it('honours an old token that carries only canManageUsers', () => {
    expect(assetManageSpaces({ role: 'EMPLOYEE', canManageUsers: true })).toBeNull();
  });
});
