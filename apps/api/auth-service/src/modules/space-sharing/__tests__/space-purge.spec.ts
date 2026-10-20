import { SpacePurgeService } from '../space-purge.service';

/*
  A workspace removed for good: auth-service drops what IT owns for that workspace
  (docs/data-ownership.md, group B) — and only inside the caller's organization.
*/
describe('SpacePurgeService.purgeForSpace', () => {
  const prisma: any = {
    spaceShare: { count: jest.fn(), deleteMany: jest.fn((a) => ({ op: 'shares', ...a })) },
    intakeCategory: { deleteMany: jest.fn((a) => ({ op: 'categories', ...a })) },
    $transaction: jest.fn(async () => [{ count: 2 }, { count: 1 }]),
  };
  const svc = new SpacePurgeService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('refuses while another organization still has an ACTIVE share', async () => {
    prisma.spaceShare.count.mockResolvedValue(1);
    const r = await svc.purgeForSpace({ organizationId: 'org-1', spaceId: 'sp-1' });
    expect(r.success).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removes the categories and leftover shares of that space, in that organization only', async () => {
    prisma.spaceShare.count.mockResolvedValue(0);
    const r = await svc.purgeForSpace({ organizationId: 'org-1', spaceId: 'sp-1' });
    expect(r).toEqual({ success: true, data: { categoriesRemoved: 2, sharesRemoved: 1 } });
    expect(prisma.intakeCategory.deleteMany).toHaveBeenCalledWith({
      where: { spaceId: 'sp-1', organizationId: 'org-1' },
    });
    expect(prisma.spaceShare.deleteMany).toHaveBeenCalledWith({ where: { spaceId: 'sp-1', ownerOrgId: 'org-1' } });
  });
});
