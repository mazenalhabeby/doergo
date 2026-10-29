import { BadRequestException } from '@nestjs/common';
import { AssetHoldersService } from '../core/asset-holders.service';

/**
 * A workspace-scoped manager gives a record only to people and clients of the
 * workspace it lives in — on create and edit, exactly as on the handover button.
 */
const MANY = { holder: { enabled: true, label: 'Resident', members: true, clients: true, multiple: true } };

function stub() {
  const prisma: any = {
    user: { findMany: jest.fn(async ({ where }: any) => (where.spaceAssignments ? [] : [{ id: 'u-other-depot' }])) },
    customer: { findMany: jest.fn(async ({ where }: any) => (where.spaceId ? [] : [{ id: 'c1' }])) },
  };
  return { svc: new AssetHoldersService(prisma), prisma };
}

describe('holders within reach', () => {
  it('a workspace-scoped manager is narrowed to the record’s workspace; an org-wide one is not', () => {
    expect(AssetHoldersService.holderReach({ manageSpaceIds: ['s1'] }, 's1')).toBe('s1');
    expect(AssetHoldersService.holderReach({ manageSpaceIds: ['s1'] }, null)).toBeNull();
    expect(AssetHoldersService.holderReach({ manageSpaceIds: null }, 's1')).toBeUndefined();
    expect(AssetHoldersService.holderReach({}, 's1')).toBeUndefined();
  });

  it('refuses a member who does not work in that workspace', async () => {
    const { svc, prisma } = stub();
    await expect(svc.resolve([{ userId: 'u-other-depot' }], 'o1', MANY, 's1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.findMany.mock.calls[0][0].where.spaceAssignments.some.spaceId).toBe('s1');
  });

  it('refuses a client filed elsewhere', async () => {
    const { svc } = stub();
    await expect(svc.resolve([{ customerId: 'c1' }], 'o1', MANY, 's1')).rejects.toThrow(/workspace/);
  });

  it('org-wide: anybody in the organization', async () => {
    const { svc } = stub();
    await expect(svc.resolve([{ userId: 'u-other-depot' }], 'o1', MANY)).resolves.toHaveLength(1);
  });
});
