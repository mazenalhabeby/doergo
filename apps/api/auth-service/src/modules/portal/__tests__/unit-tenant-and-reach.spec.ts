import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { portalServices } from './portal-services.fixture';
import { CustomersService } from '../../customers/customers.service';
import { CrmReachService } from '../../customers/crm-reach.service';

/*
  A unit write names ids from a request body — a space, a portal, a client, a
  resident. Every one must be THIS organization's, and the CRM address routes
  must obey the CRM's per-record reach (own clients only for a scoped rep), not
  just "holds crmEditInfo somewhere".
*/
const ORG = 'org-1';

function setup() {
  const prisma: Record<string, any> = {
    companyLocation: { findFirst: jest.fn() },
    portal: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    customerUnit: {
      findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0), updateMany: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'u-new' }), update: jest.fn().mockResolvedValue({ id: 'u1' }),
    },
    customerUnitActivity: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const customers = new CustomersService(prisma as any, new CrmReachService(prisma as any));
  const service = portalServices(prisma, customers);
  return { prisma, service };
}

describe('unit references stay inside the tenant', () => {
  it('refuses a space from another organization on create', async () => {
    const { prisma, service } = setup();
    prisma.companyLocation.findFirst.mockResolvedValue(null);
    await expect(service.createUnit({ organizationId: ORG, name: 'Flat', spaceId: 'space-of-org-2' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'space-of-org-2', organizationId: ORG } }));
    expect(prisma.customerUnit.create).not.toHaveBeenCalled();
  });

  it('refuses a portal from another organization on update', async () => {
    const { prisma, service } = setup();
    prisma.portal.findFirst.mockResolvedValue(null);
    await expect(service.updateUnit({ id: 'u1', organizationId: ORG, portalId: 'portal-of-org-2' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customerUnit.update).not.toHaveBeenCalled();
  });
});

describe('CRM address writes obey the CRM reach rule', () => {
  const rep = { userId: 'rep-1', role: 'EMPLOYEE' };
  const asRep = (prisma: any, perms: Record<string, boolean>) =>
    prisma.user.findFirst.mockResolvedValue({ role: 'EMPLOYEE', memberRole: { isActive: true, permissions: perms } });

  it("a rep scoped to their OWN clients cannot edit somebody else's client's address", async () => {
    const { prisma, service } = setup();
    asRep(prisma, { crmViewOwn: true, crmEditInfo: true });
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-other', ownerId: 'someone-else', managerIds: [], isPortalResident: false });
    await expect(
      service.updateUnit({ id: 'u1', organizationId: ORG, scopeCustomerId: 'c-other', name: 'x', crmCaller: rep }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.deleteUnit({ id: 'u1', organizationId: ORG, customerId: 'c-other', crmCaller: rep }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setPrimaryUnit({ id: 'u1', organizationId: ORG, customerId: 'c-other', crmCaller: rep }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createUnit({ organizationId: ORG, customerId: 'c-other', name: 'x', crmCaller: rep }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customerUnit.update).not.toHaveBeenCalled();
    expect(prisma.customerUnit.create).not.toHaveBeenCalled();
  });

  it('a rep who reaches the client but lacks editInfo is refused', async () => {
    const { prisma, service } = setup();
    asRep(prisma, { crmViewOwn: true });
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-mine', ownerId: 'rep-1', managerIds: [], isPortalResident: false });
    await expect(
      service.updateUnit({ id: 'u1', organizationId: ORG, scopeCustomerId: 'c-mine', name: 'x', crmCaller: rep }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a client in another organization is simply not found', async () => {
    const { prisma, service } = setup();
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(
      service.updateUnit({ id: 'u1', organizationId: ORG, scopeCustomerId: 'c-org-2', crmCaller: { userId: 'a', role: 'ADMIN' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c-org-2', organizationId: ORG } }));
  });

  it("the rep's OWN client's address is editable", async () => {
    const { prisma, service } = setup();
    asRep(prisma, { crmViewOwn: true, crmEditInfo: true });
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-mine', ownerId: 'rep-1', managerIds: [], isPortalResident: false });
    prisma.customerUnit.findFirst.mockResolvedValue({ id: 'u1', customerId: 'c-mine', residentUserId: null, spaceId: null });
    prisma.customerUnit.update.mockResolvedValue({ id: 'u1', customerId: 'c-mine', residentUserId: null });
    await expect(
      service.updateUnit({ id: 'u1', organizationId: ORG, scopeCustomerId: 'c-mine', name: 'Home', crmCaller: rep }),
    ).resolves.toEqual(expect.objectContaining({ id: 'u1' }));
  });
});

/*
  `spaces/:spaceId/units/:unitId` — the unit must belong to THAT workspace, not
  merely to the organization, or a manager of one workspace edits any apartment
  by putting its id under the path of the workspace they do manage.
*/
describe('workspace unit routes stay inside their workspace', () => {
  it('update: a unit of another workspace is not found', async () => {
    const { prisma, service } = setup();
    prisma.customerUnit.findFirst.mockResolvedValue(null);
    await expect(service.updateUnit({ id: 'u1', organizationId: ORG, scopeSpaceId: 'sp-A', name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customerUnit.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: 'u1', organizationId: ORG, spaceId: 'sp-A' }),
    );
    expect(prisma.customerUnit.update).not.toHaveBeenCalled();
  });

  it('delete: a unit of another workspace is not found', async () => {
    const { prisma, service } = setup();
    prisma.customerUnit.findFirst.mockResolvedValue(null);
    await expect(service.deleteUnit({ id: 'u1', organizationId: ORG, scopeSpaceId: 'sp-A' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customerUnit.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: 'u1', organizationId: ORG, spaceId: 'sp-A' }),
    );
    expect(prisma.customerUnit.update).not.toHaveBeenCalled();
  });
});
