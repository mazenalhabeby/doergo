import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { taskPortalParts } from './task-portal.service.fixture';

/*
  Portal REQUESTS honoured per workspace.

  A request's workspace is its PORTAL's — the one it was RAISED in
  (`Task.portalId`), never the client's current one — not
  `Task.spaceId` — that stays empty until triage and then names wherever the
  work was routed. `scopeSpaceIds` comes from the gateway (`portalScope`):
  undefined = org-wide, ['A'] = only workspace A, [] = nothing.
*/
const ORG = 'org-1';

function setup() {
  const prisma: any = {
    portal: { findFirst: jest.fn() },
    companyLocation: { findFirst: jest.fn() },
    task: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn() },
    spaceAssignment: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    statusWorkflow: { findFirst: jest.fn() },
    workflowStatus: { findFirst: jest.fn() },
    customerUnit: { findFirst: jest.fn() },
  };
  const service = taskPortalParts(prisma, { emit: jest.fn() } as any, {} as any, {} as any, {} as any);
  return { prisma, service };
}

describe('reading requests', () => {
  it('a space-only viewer’s resident list is narrowed to portals in their workspace', async () => {
    const { prisma, service } = setup();
    await service.listPortalRequests({ organizationId: ORG, customerId: 'c1', scopeSpaceIds: ['A'] });
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      customerId: 'c1',
      portal: { spaceId: { in: ['A'] } },
    });
  });

  it('granted nowhere ([]) still narrows — to IN (), which is nothing', async () => {
    const { prisma, service } = setup();
    await service.listPortalRequests({ organizationId: ORG, customerId: 'c1', scopeSpaceIds: [] });
    expect(prisma.task.findMany.mock.calls[0][0].where.portal).toEqual({ spaceId: { in: [] } });
  });

  it('the customer’s own list (no scope) is unchanged', async () => {
    const { prisma, service } = setup();
    await service.listPortalRequests({ organizationId: ORG, customerId: 'c1' });
    expect(prisma.task.findMany.mock.calls[0][0].where).not.toHaveProperty('portal');
  });

  it('another workspace’s portal inbox is 404, and no request is read', async () => {
    const { prisma, service } = setup();
    prisma.portal.findFirst.mockResolvedValue({ id: 'pB', spaceId: 'B' });
    await expect(
      service.listPortalRequestsByPortal({ organizationId: ORG, portalId: 'pB', scopeSpaceIds: ['A'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it('an organization-level portal (no workspace) is 404 to a workspace-scoped viewer', async () => {
    const { prisma, service } = setup();
    prisma.portal.findFirst.mockResolvedValue({ id: 'pOrg', spaceId: null });
    await expect(
      service.listPortalRequestsByPortal({ organizationId: ORG, portalId: 'pOrg', scopeSpaceIds: ['A'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('their own workspace’s inbox is read', async () => {
    const { prisma, service } = setup();
    prisma.portal.findFirst.mockResolvedValue({ id: 'pA', spaceId: 'A' });
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 'A', name: 'A' });
    await service.listPortalRequestsByPortal({ organizationId: ORG, portalId: 'pA', scopeSpaceIds: ['A'] });
    expect(prisma.task.findMany).toHaveBeenCalled();
  });

  it('the inbox reads the portal a request was RAISED in, not the client’s current portal', async () => {
    // A client removed from the portal (customer.portalId = null) kept requests there: they must stay listed.
    const { prisma, service } = setup();
    prisma.portal.findFirst.mockResolvedValue({ id: 'pA', spaceId: 'A' });
    await service.listPortalRequestsByPortal({ organizationId: ORG, portalId: 'pA' });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.portalId).toBe('pA');
    expect(where).not.toHaveProperty('customer');
  });

  it('the inbox across portals groups by the request’s own portal', async () => {
    const { prisma, service } = setup();
    prisma.portal.findMany = jest.fn().mockResolvedValue([{ id: 'pA', spaceId: null }]);
    prisma.companyLocation.findMany = jest.fn().mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Leak',
        status: 'NEW',
        priority: 'LOW',
        portalId: 'pA',
        customer: { id: 'c', name: 'Ex' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res: any = await service.listWaitingPortalRequests({ organizationId: ORG });
    expect(prisma.task.findMany.mock.calls[0][0].where.portalId).toEqual({ in: ['pA'] });
    expect(res.data.map((r: any) => r.id)).toEqual(['t1']);
  });
});

describe('answering (triage)', () => {
  it('a request from another workspace’s portal is 404 — the lookup itself is narrowed', async () => {
    const { prisma, service } = setup();
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(
      service.triageRequest({ id: 't1', organizationId: ORG, userId: 'u', spaceId: 'A', scopeSpaceIds: ['A'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.task.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 't1',
      portal: { spaceId: { in: ['A'] } },
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('cannot route their request onto another workspace’s board', async () => {
    const { prisma, service } = setup();
    prisma.task.findFirst.mockResolvedValue({ id: 't1', triaged: false });
    await expect(
      service.triageRequest({ id: 't1', organizationId: ORG, userId: 'u', spaceId: 'B', scopeSpaceIds: ['A'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('naming a worker needs the right to assign work in that workspace', async () => {
    const { prisma, service } = setup();
    prisma.task.findFirst.mockResolvedValue({ id: 't1', triaged: false });
    await expect(
      service.triageRequest({
        id: 't1',
        organizationId: ORG,
        userId: 'u',
        spaceId: 'A',
        assignedToId: 'w1',
        scopeSpaceIds: ['A'],
        assignScopeSpaceIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});
