import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { customerServices } from './customer-services.fixture';

/*
  A client joins a portal of ITS OWN workspace.

  The portal id was only checked to be the organization's, so a client of
  workspace A could be attached to workspace B's portal — B's request flow and
  config then served A's client.
*/

const ORG = 'org-1';
const portals: Record<string, any> = { pA: { id: 'pA', spaceId: 'A' }, pB: { id: 'pB', spaceId: 'B' } };
const clients: Record<string, any> = {
  inA: {
    id: 'inA',
    spaceId: 'A',
    ownerId: null,
    managerIds: [],
    status: 'LEAD',
    isPortalResident: false,
    portalId: null,
  },
};
const creatorRow = {
  role: 'EMPLOYEE',
  organizationId: ORG,
  isExternal: false,
  organization: { enabledModules: ['crm'] },
  memberRole: { permissions: { crmViewAll: true, crmCreateClients: true }, isActive: true },
  spaceAssignments: [],
};

function setup(row: unknown = null) {
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(row), findMany: jest.fn().mockResolvedValue([]) },
    customer: {
      findFirst: jest.fn(async ({ where }: any) => (where.organizationId === ORG ? (clients[where.id] ?? null) : null)),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ ...clients[where.id], ...data })),
    },
    portal: { findFirst: jest.fn(async ({ where }: any) => portals[where.id] ?? null) },
    companyLocation: { findFirst: jest.fn(async ({ where }: any) => ({ id: where.id })) },
    customerActivity: { create: jest.fn() },
  };
  const service = customerServices(prisma);
  (service as any).clientCompany = async () => undefined;
  return { service, prisma };
}

const admin = { userId: 'adm', role: 'ADMIN' };

describe('a client is attached only to a portal of its own workspace', () => {
  it('refuses another workspace’s portal (coded), nothing written', async () => {
    const { service, prisma } = setup();
    const err = await service.update('inA', ORG, { portalId: 'pB' }, 'adm', admin).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().code).toBe('CRM_PORTAL_OTHER_WORKSPACE');
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('accepts its own workspace’s portal', async () => {
    const { service, prisma } = setup();
    await service.update('inA', ORG, { portalId: 'pA', isPortalResident: true }, 'adm', admin);
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  it('a create files a portal only of the same workspace, and only for a manager', async () => {
    const { service } = setup();
    await expect(service.create(ORG, { name: 'X', spaceId: 'A', portalId: 'pB' }, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const creator = setup(creatorRow).service;
    await expect(
      creator.create(ORG, { name: 'X', portalId: 'pA' }, { userId: 'c', role: 'EMPLOYEE' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
