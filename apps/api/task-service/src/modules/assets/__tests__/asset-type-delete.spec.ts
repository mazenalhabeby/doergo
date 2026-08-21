import { BadRequestException } from '@nestjs/common';
import { AssetCatalogService } from '../asset-catalog.service';
import { AssetAccessService } from '../asset-access.service';

/**
 * Deleting a type used to detach its assets instead of refusing.
 *
 * That single `updateMany` — categoryId to null — is where every orphaned asset
 * came from. The SPACE lives on the type, so an asset without one belongs to no
 * space: gone from every screen, still attached to its tasks, still counted on
 * the bill. Nine of them were found this way in a real database, and nobody had
 * pressed anything more dangerous than a bin icon on a type they had finished
 * with.
 *
 * Reached through the real class with a stub client, so restoring the detach
 * fails this test rather than passing a re-implementation of the rule.
 */
const CATEGORY = { id: 'cat_1', organizationId: 'org_1' };
const ACTOR = { id: 'cat_1', userId: 'u1', userRole: 'ADMIN', organizationId: 'org_1' };

function serviceHolding(assetCount: number) {
  const calls = { updateMany: 0, delete: 0 };
  const prisma: any = {
    assetCategory: {
      findUnique: jest.fn().mockResolvedValue({ ...CATEGORY, _count: { assets: assetCount } }),
      delete: jest.fn(async () => { calls.delete++; return CATEGORY; }),
    },
    asset: {
      updateMany: jest.fn(async () => { calls.updateMany++; return { count: assetCount }; }),
    },
  };
  return { service: new AssetCatalogService(prisma, new AssetAccessService(prisma)), calls };
}

describe('deleting an asset type', () => {
  it('refuses while it still holds assets, and detaches nothing', async () => {
    const { service, calls } = serviceHolding(3);

    await expect(service.deleteCategory({ ...ACTOR } as any)).rejects.toBeInstanceOf(BadRequestException);

    // The important half: nothing was quietly orphaned on the way to the error.
    expect(calls.updateMany).toBe(0);
    expect(calls.delete).toBe(0);
  });

  it('says how many are in the way, so the message can be acted on', async () => {
    const { service } = serviceHolding(3);
    await expect(service.deleteCategory({ ...ACTOR } as any)).rejects.toThrow(/still holds 3 assets/);

    const one = serviceHolding(1);
    await expect(one.service.deleteCategory({ ...ACTOR } as any)).rejects.toThrow(/still holds 1 asset\./);
  });

  it('deletes an empty type', async () => {
    const { service, calls } = serviceHolding(0);
    await service.deleteCategory({ ...ACTOR } as any);
    expect(calls.delete).toBe(1);
    expect(calls.updateMany).toBe(0);
  });
});
