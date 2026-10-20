import { SpaceRoleWritesService } from '../space-role-writes.service';

describe('SpaceRoleWritesService — auth writes workspace roles for task-service', () => {
  const prisma: any = {
    accessRole: {
      create: jest.fn(async ({ data }: any) => ({ id: 'r1', ...data })),
      findFirst: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({ id: 'r1', ...data })),
    },
  };
  const service = new SpaceRoleWritesService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('creates in the caller’s organization, a SPACE role by default, never without permissions', async () => {
    await service.create({ organizationId: 'org1', role: { name: 'Lead', slug: 'lead' } as any });
    expect(prisma.accessRole.create.mock.calls[0][0].data).toMatchObject({
      organizationId: 'org1',
      scope: 'SPACE',
      permissions: {},
    });
  });

  it('edits only a SPACE/BOTH role of the same organization', async () => {
    prisma.accessRole.findFirst.mockResolvedValue(null);
    const r = await service.update({ organizationId: 'org1', roleId: 'other-org-role', patch: { name: 'X' } as any });
    expect(r.success).toBe(false);
    expect(prisma.accessRole.findFirst.mock.calls[0][0].where).toEqual({
      id: 'other-org-role',
      organizationId: 'org1',
      scope: { in: ['SPACE', 'BOTH'] },
    });
    expect(prisma.accessRole.update).not.toHaveBeenCalled();
  });
});
