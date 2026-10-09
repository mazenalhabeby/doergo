import { NotFoundException } from '@nestjs/common';
import { assertSpaceInOrg, assertUserInOrg, assertUsersInOrg, assertWorkflowInOrg } from '../tenant-scope.util';

/*
  One tenancy rule, one status. The space-roles and shifts services used to
  carry private copies answering 404 while this file answered 400; the copies
  are gone. Pinned here: every refusal is a NotFound, a scope narrows, and an
  archived space can be refused for writes.
*/
const ORG = 'org-1';
function prismaWith(spaces: Array<{ id: string; organizationId: string; isActive: boolean }>) {
  return {
    companyLocation: {
      findFirst: jest.fn(async ({ where }: any) =>
        spaces.find((s) => s.id === where.id && s.organizationId === where.organizationId && (where.isActive === undefined || s.isActive === where.isActive)) ?? null),
    },
    user: { findFirst: jest.fn(async ({ where }: any) => (where.id === 'u-1' && where.organizationId === ORG ? { id: 'u-1', isExternal: false } : null)), findMany: jest.fn(async () => []) },
    statusWorkflow: { findFirst: jest.fn(async () => null) },
  } as any;
}

describe('tenant-scope.util', () => {
  const prisma = prismaWith([
    { id: 'sp-1', organizationId: ORG, isActive: true },
    { id: 'sp-old', organizationId: ORG, isActive: false },
    { id: 'sp-x', organizationId: 'org-2', isActive: true },
  ]);

  it('every refusal is a 404', async () => {
    await expect(assertSpaceInOrg(prisma, 'sp-x', ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertUserInOrg(prisma, 'u-9', ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertUsersInOrg(prisma, ['u-9'], ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertWorkflowInOrg(prisma, 'wf-9', ORG)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a space outside the granted scope reads as absent; [] grants nothing; undefined is org-wide', async () => {
    await expect(assertSpaceInOrg(prisma, 'sp-1', ORG, { scope: ['sp-2'] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertSpaceInOrg(prisma, 'sp-1', ORG, { scope: [] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertSpaceInOrg(prisma, 'sp-1', ORG, { scope: ['sp-1'] })).resolves.toBeUndefined();
    await expect(assertSpaceInOrg(prisma, 'sp-1', ORG)).resolves.toBeUndefined();
  });

  it('an archived space passes a read and is refused for a write', async () => {
    await expect(assertSpaceInOrg(prisma, 'sp-old', ORG)).resolves.toBeUndefined();
    await expect(assertSpaceInOrg(prisma, 'sp-old', ORG, { activeOnly: true })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertUserInOrg answers who the member works for', async () => {
    await expect(assertUserInOrg(prisma, 'u-1', ORG)).resolves.toEqual({ id: 'u-1', isExternal: false });
  });
});
