import { BadRequestException } from '@nestjs/common';
import { AssetHoldersService } from '../core/asset-holders.service';
import { AssetUpdateService } from '../register/asset-update.service';

/**
 * Moving a record to another kind without naming holders keeps today's — only
 * if the new kind still allows them. Otherwise ASSET_MOVE_HOLDERS: the office
 * chooses who holds it (or nobody) with the move; custody is never closed quietly.
 */
const DRIVER = { holder: { enabled: true, label: 'Driver', members: true, clients: false, multiple: false } };
const TENANTS = { holder: { enabled: true, label: 'Tenant', members: false, clients: true, multiple: true } };
const NOBODY = { holder: { enabled: false } };

function setup(destination: unknown, holders: Array<{ userId: string | null; customerId: string | null }>) {
  const prisma: any = {
    asset: {
      findUnique: jest.fn().mockResolvedValue({ id: 'a1', organizationId: 'o1', categoryId: 'k-old', details: [] }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'a1', holders: [] }),
    },
    assetCategory: {
      findUnique: jest.fn().mockResolvedValue({ id: 'k-new', organizationId: 'o1', spaceId: null, config: destination }),
    },
    assetHolder: { findMany: jest.fn().mockResolvedValue(holders) },
    user: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id }))) },
    customer: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id }))) },
    $transaction: jest.fn(async (fn: any) => fn({ asset: { update: jest.fn().mockResolvedValue({ id: 'a1' }) } })),
  };
  const access: any = { assetInScope: jest.fn(), mayIn: () => true };
  const custody: any = { apply: jest.fn(), announce: jest.fn() };
  const svc = new AssetUpdateService(prisma, access, {} as any, new AssetHoldersService(prisma), custody);
  const move = () => svc.update({ id: 'a1', categoryId: 'k-new', organizationId: 'o1', userId: 'admin' } as any);
  return { move, prisma, custody };
}

async function code(p: Promise<unknown>) {
  const e: any = await p.catch((x) => x);
  expect(e).toBeInstanceOf(BadRequestException);
  return e.getResponse().code;
}

describe('moving a record to another kind — the holders it keeps', () => {
  const ahmed = { userId: 'u-ahmed', customerId: null };

  it('refuses a driver kept on a kind held by clients only', async () => {
    const { move, custody } = setup(TENANTS, [ahmed]);
    await expect(code(move())).resolves.toBe('ASSET_MOVE_HOLDERS');
    expect(custody.apply).not.toHaveBeenCalled();
  });

  it('refuses holders kept on a kind nobody holds', async () => {
    const { move } = setup(NOBODY, [ahmed]);
    await expect(code(move())).resolves.toBe('ASSET_MOVE_HOLDERS');
  });

  it('refuses two operators kept on a one-at-a-time kind', async () => {
    const { move } = setup(DRIVER, [ahmed, { userId: 'u-bea', customerId: null }]);
    await expect(code(move())).resolves.toBe('ASSET_MOVE_HOLDERS');
  });

  it('lets a move through when the holders still fit, or there are none', async () => {
    await expect(setup(DRIVER, [ahmed]).move()).resolves.toMatchObject({ success: true });
    await expect(setup(NOBODY, []).move()).resolves.toMatchObject({ success: true });
  });
});
