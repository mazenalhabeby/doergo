import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BILLABLE_ASSET_WHERE } from '@hbcfield/shared';
import { AssetsService } from '../assets.service';
import { AssetAccessService } from '../asset-access.service';
import { AssetActivityService } from '../asset-activity.service';
import { AssetHoldersService } from '../asset-holders.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Audit AS-B1 — an asset's value is its history.
 *
 * `delete` was a HARD delete: it nulled `Task.assetId` on every job ever done to
 * that machine and then removed the row, permanently, behind `canViewAllTasks` —
 * a read-level manager flag, where every other permanent delete in the product
 * requires `canManageUsers`.
 *
 * The product already has the right answer for "this is out of service": status
 * RETIRED, which is precisely what `BILLABLE_ASSET_WHERE` excludes, so retiring
 * keeps the record and its history *and* stops the billing.
 */
describe('AssetsService.delete — history is not disposable (AS-B1)', () => {
  let service: AssetsService;

  const prisma: any = {
    asset: { findUnique: jest.fn(), delete: jest.fn() },
    task: { updateMany: jest.fn() },
  };

  const asset = (tasks: number) => ({
    id: 'a-1',
    organizationId: 'org-1',
    _count: { tasks },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.asset.delete.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AssetAccessService, useValue: { assertMay: jest.fn() } },
        { provide: AssetActivityService, useValue: { record: jest.fn() } },
        { provide: AssetHoldersService, useValue: {} },
      ],
    }).compile();
    service = module.get(AssetsService);
  });

  const del = () =>
    service.delete({ id: 'a-1', organizationId: 'org-1', userId: 'u-1', userRole: 'ADMIN' } as any);

  it('refuses an asset that has jobs against it, and points at Retired', async () => {
    prisma.asset.findUnique.mockResolvedValue(asset(7));
    await expect(del()).rejects.toBeInstanceOf(BadRequestException);
    await expect(del().catch((e) => e.message)).resolves.toMatch(/retired/i);
    expect(prisma.asset.delete).not.toHaveBeenCalled();
    // And it must not have detached the history on the way to refusing.
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('still deletes an asset with no history', async () => {
    prisma.asset.findUnique.mockResolvedValue(asset(0));
    await expect(del()).resolves.toMatchObject({ success: true });
    expect(prisma.asset.delete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
  });

  it('still refuses another organization’s asset', async () => {
    prisma.asset.findUnique.mockResolvedValue({ ...asset(0), organizationId: 'other-org' });
    await expect(del()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a missing asset', async () => {
    prisma.asset.findUnique.mockResolvedValue(null);
    await expect(del()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RETIRED is genuinely the billing off-switch, which is why it is the answer', () => {
    expect(BILLABLE_ASSET_WHERE).toEqual({ status: { not: 'RETIRED' } });
  });
});
