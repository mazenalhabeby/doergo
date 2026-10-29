import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CrmReachService } from '../../customers/crm-reach.service';
import { CustomerRefsService } from '../../customers/customer-refs.service';
import { CustomerWriteService } from '../../customers/customer-write.service';
import { PortalAdmitService } from '../portal-admit.service';

/*
  Inviting a resident into a portal.

  The gateway called the CRM's create/update WITHOUT a caller; the CRM's reach
  for "nobody" is no caps, so every invite failed with "Not allowed to create
  clients" — the owner's too. The portal's own manage authority now admits the
  client, and a new one is filed in the PORTAL's workspace.
*/

const ORG = 'org-1';
const portals: Record<string, any> = { P: { id: 'P', spaceId: 'S', organizationId: ORG } };
const clients: Record<string, any> = {
  inS: { id: 'inS', status: 'LEAD', isPortalResident: false, ownerId: null, managerIds: ['rep'], spaceId: 'S', portalId: null },
  inOther: { id: 'inOther', status: 'LEAD', isPortalResident: false, ownerId: null, managerIds: [], spaceId: 'T', portalId: null },
};

function setup() {
  const prisma: any = {
    portal: {
      findFirst: jest.fn(async ({ where }: any) => {
        const p = portals[where.id];
        if (!p || where.organizationId !== ORG) return null;
        if (where.spaceId?.in && !where.spaceId.in.includes(p.spaceId)) return null;
        return p;
      }),
    },
    customer: {
      findFirst: jest.fn(async ({ where }: any) => {
        const c = clients[where.id];
        if (!c || where.organizationId !== ORG) return null;
        if (where.OR && !where.OR.some((o: any) => Object.entries(o).every(([k, v]) => c[k] === v))) return null;
        return c;
      }),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ ...clients[where.id], ...data })),
    },
    customerActivity: { create: jest.fn() },
    companyLocation: { findFirst: jest.fn(async ({ where }: any) => ({ id: where.id })) },
    user: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  };
  const refs = new CustomerRefsService(prisma);
  (refs as any).clientCompany = async () => undefined;
  const write = new CustomerWriteService(prisma, new CrmReachService(prisma), refs);
  return { prisma, write, admit: new PortalAdmitService(prisma, write) };
}

describe('portal: inviting a resident', () => {
  it('the CRM create path refuses a caller-less call (why the invite always failed)', async () => {
    const { write } = setup();
    await expect(write.create(ORG, { name: 'X', isPortalResident: true, portalId: 'P' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a portal manager creates a new resident, filed in the portal workspace', async () => {
    const { admit, prisma } = setup();
    const res: any = await admit.admitResident({ organizationId: ORG, portalId: 'P', name: 'Flat 3', scopeSpaceIds: ['S'] });
    expect(res.data.id).toBe('new');
    const data = prisma.customer.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ spaceId: 'S', portalId: 'P', isPortalResident: true, name: 'Flat 3' });
  });

  it('promotes an existing client of the portal workspace, with the app hand-off', async () => {
    const { admit, prisma } = setup();
    await admit.admitResident({ organizationId: ORG, portalId: 'P', customerId: 'inS', email: 'a@b.c', actorId: 'u1' });
    const data = prisma.customer.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ isPortalResident: true, portalId: 'P', email: 'a@b.c', managerIds: [], status: 'CUSTOMER' });
  });

  it('refuses a client of another workspace, and a portal out of scope', async () => {
    const { admit, prisma } = setup();
    await expect(admit.admitResident({ organizationId: ORG, portalId: 'P', customerId: 'inOther' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(admit.admitResident({ organizationId: ORG, portalId: 'P', scopeSpaceIds: ['T'] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });
});
