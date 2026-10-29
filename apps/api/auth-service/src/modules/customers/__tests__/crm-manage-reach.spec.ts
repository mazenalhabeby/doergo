import { NotFoundException } from '@nestjs/common';
import { customerServices } from './customer-services.fixture';

/*
  Manage acts on the clients the caller REACHES.

  `assertManage` returned as soon as the caller held manage, before asking
  whether they could reach the client at all — so a rep with own-book view +
  "Manage clients" could take over or delete ANY client of the organization.
*/

const ORG = 'org-1';
const repRow = {
  role: 'EMPLOYEE',
  organizationId: ORG,
  isExternal: false,
  organization: { enabledModules: ['crm'] },
  memberRole: { permissions: { crmViewOwn: true, crmManageClients: true }, isActive: true },
  spaceAssignments: [],
};
const clients: Record<string, any> = {
  mine: { id: 'mine', spaceId: null, ownerId: 'rep', managerIds: [], status: 'LEAD', isPortalResident: false },
  theirs: { id: 'theirs', spaceId: null, ownerId: 'other', managerIds: [], status: 'LEAD', isPortalResident: false },
};

function setup() {
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(repRow), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    customer: {
      findFirst: jest.fn(async ({ where }: any) => (where.organizationId === ORG ? (clients[where.id] ?? null) : null)),
      update: jest.fn(async ({ where, data }: any) => ({ ...clients[where.id], ...data })),
    },
    customerActivity: { create: jest.fn() },
    $transaction: jest.fn(async () => []),
  };
  const service = customerServices(prisma);
  (service as any).clientCompany = async () => undefined;
  return { service, prisma };
}

const rep = { userId: 'rep', role: 'EMPLOYEE' };

describe('CRM manage needs reach (own-book view + manage)', () => {
  it('cannot delete a client outside their book — 404, nothing written', async () => {
    const { service, prisma } = setup();
    await expect(service.remove('theirs', ORG, rep)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cannot take a client outside their book', async () => {
    const { service, prisma } = setup();
    await expect(service.update('theirs', ORG, { ownerId: 'rep' }, 'rep', rep)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('still manages their own client', async () => {
    const { service, prisma } = setup();
    await service.remove('mine', ORG, rep);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
