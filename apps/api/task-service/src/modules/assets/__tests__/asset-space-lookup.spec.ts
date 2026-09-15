/**
 * The gateway's ModuleGuard asks which workspace an asset lives in before a
 * write. It has no member to name, so the answer must not depend on one — and
 * it must give away nothing but the space id, inside the organization only.
 */
import { AssetsService } from '../assets.service';

it('returns the kind’s space, scoped to the organization, and nothing else', async () => {
  const findFirst = jest.fn().mockResolvedValue({ category: { spaceId: 'space-1' } });
  const svc = Object.create(AssetsService.prototype) as any;
  svc.prisma = { asset: { findFirst } };

  const res: any = await svc.spaceOf({ id: 'asset-1', organizationId: 'org-1' });

  expect(res.data).toEqual({ spaceId: 'space-1' });
  expect(findFirst).toHaveBeenCalledWith({
    where: { id: 'asset-1', organizationId: 'org-1' },
    select: { category: { select: { spaceId: true } } },
  });
});

it('another organization’s asset reads as no space', async () => {
  const svc = Object.create(AssetsService.prototype) as any;
  svc.prisma = { asset: { findFirst: jest.fn().mockResolvedValue(null) } };
  const res: any = await svc.spaceOf({ id: 'asset-1', organizationId: 'org-2' });
  expect(res.data).toEqual({ spaceId: null });
});
