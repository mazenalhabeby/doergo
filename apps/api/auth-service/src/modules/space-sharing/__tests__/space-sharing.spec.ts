import { SpaceSharingService } from '../space-sharing.service';

/*
  Sharing a workspace with another organization. Every write is scoped twice:
  the OWNER side only touches shares of its own workspaces, the GUEST side only
  shares addressed to its own organization. A share grants nothing until the
  guest accepts it; revoking takes the guest's people off the workspace; a
  request from a guest needs an ACTIVE share that allows requests.
*/
const OWNER = 'org-owner';
const GUEST = 'org-guest';

function setup() {
  const prisma: any = {
    companyLocation: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.organizationId === OWNER ? { id: where.id, name: 'Depot', organizationId: OWNER } : null,
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    organization: {
      findFirst: jest.fn().mockResolvedValue({ id: GUEST, name: 'Client GmbH' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    spaceShare: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'sh1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'sh1', ...data })),
    },
    spaceShareRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: 'rq1', ...data })),
      update: jest.fn(async ({ data }: any) => ({ id: 'rq1', ...data })),
    },
  };
  const offboarding: any = { releaseSharedSpace: jest.fn() };
  return { prisma, offboarding, svc: new SpaceSharingService(prisma, offboarding) };
}

const invite = { ownerOrgId: OWNER, createdById: 'u1', spaceId: 'sp1', guestOrgCode: ' ACME2026 ' };

describe('inviting another organization', () => {
  it("only into the owner's own workspace", async () => {
    const { prisma, svc } = setup();
    expect(await svc.createShare({ ...invite, ownerOrgId: 'org-x' })).toMatchObject({
      success: false,
      statusCode: 404,
    });
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it('the guest is found by its join code, active organizations only', async () => {
    const { prisma, svc } = setup();
    await svc.createShare(invite);
    expect(prisma.organization.findFirst.mock.calls[0][0].where).toEqual({ joinCode: 'ACME2026', isActive: true });
    prisma.organization.findFirst.mockResolvedValueOnce(null);
    expect(await svc.createShare(invite)).toMatchObject({ success: false, statusCode: 404 });
    expect(await svc.createShare({ ...invite, guestOrgCode: '  ' })).toMatchObject({ success: false, statusCode: 400 });
  });

  it('never with the own organization', async () => {
    const { prisma, svc } = setup();
    prisma.organization.findFirst.mockResolvedValueOnce({ id: OWNER, name: 'Us' });
    expect(await svc.createShare(invite)).toMatchObject({
      success: false,
      message: expect.stringContaining('your own'),
    });
    expect(prisma.spaceShare.create).not.toHaveBeenCalled();
  });

  it('starts PENDING with the cautious defaults; an unknown level is VIEW', async () => {
    const { prisma, svc } = setup();
    await svc.createShare({ ...invite, level: 'ADMIN' as any });
    expect(prisma.spaceShare.create.mock.calls[0][0].data).toMatchObject({
      ownerOrgId: OWNER,
      guestOrgId: GUEST,
      level: 'VIEW',
      status: 'PENDING',
      showWorkers: true,
      showAttendance: false,
      showTracking: false,
      showReports: false,
      allowRequests: true,
    });
  });

  it('re-inviting a revoked or declined share re-opens it as PENDING; an ACTIVE one is refused', async () => {
    const { prisma, svc } = setup();
    prisma.spaceShare.findUnique.mockResolvedValueOnce({ id: 'old', status: 'REVOKED' });
    await svc.createShare({ ...invite, level: 'CONTRIBUTE' });
    expect(prisma.spaceShare.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'old' },
      data: { status: 'PENDING', level: 'CONTRIBUTE', acceptedAt: null, acceptedById: null },
    });

    prisma.spaceShare.findUnique.mockResolvedValueOnce({ id: 'old', status: 'ACTIVE' });
    expect(await svc.createShare(invite)).toMatchObject({
      success: false,
      message: expect.stringContaining('already shared'),
    });
  });
});

describe('the owner changes or ends a share', () => {
  it('only its own shares; switches are stored as booleans, an unknown level is ignored', async () => {
    const { prisma, svc } = setup();
    expect(await svc.updateShare({ ownerOrgId: OWNER, shareId: 'sh1' })).toMatchObject({ statusCode: 404 });
    expect(prisma.spaceShare.findFirst.mock.calls[0][0].where).toEqual({ id: 'sh1', ownerOrgId: OWNER });

    prisma.spaceShare.findFirst.mockResolvedValueOnce({ id: 'sh1', guestOrgId: GUEST });
    await svc.updateShare({ ownerOrgId: OWNER, shareId: 'sh1', level: 'GOD' as any, showTracking: 1 as any });
    expect(prisma.spaceShare.update.mock.calls[0][0].data).toEqual({ showTracking: true });
  });

  it("revoking marks it REVOKED first, then takes the guest's people off the workspace", async () => {
    const { prisma, offboarding, svc } = setup();
    prisma.spaceShare.findFirst.mockResolvedValueOnce({ id: 'sh1', guestOrgId: GUEST, spaceId: 'sp1' });
    const order: string[] = [];
    prisma.spaceShare.update.mockImplementationOnce(async () => order.push('revoked'));
    offboarding.releaseSharedSpace.mockImplementationOnce(async () => order.push('released'));
    expect(await svc.revokeShare({ ownerOrgId: OWNER, shareId: 'sh1' })).toEqual({ success: true, guestOrgId: GUEST });
    expect(order).toEqual(['revoked', 'released']);
    expect(offboarding.releaseSharedSpace).toHaveBeenCalledWith(OWNER, 'sp1', GUEST);
  });

  it("revoking another organization's share does nothing", async () => {
    const { prisma, offboarding, svc } = setup();
    expect(await svc.revokeShare({ ownerOrgId: OWNER, shareId: 'theirs' })).toMatchObject({ statusCode: 404 });
    expect(prisma.spaceShare.update).not.toHaveBeenCalled();
    expect(offboarding.releaseSharedSpace).not.toHaveBeenCalled();
  });
});

describe('the guest answers', () => {
  it('only a PENDING invite addressed to its own organization', async () => {
    const { prisma, svc } = setup();
    expect(await svc.respondToShare({ guestOrgId: GUEST, shareId: 'sh1', accept: true, userId: 'g1' })).toMatchObject({
      statusCode: 404,
    });
    expect(prisma.spaceShare.findFirst.mock.calls[0][0].where).toEqual({
      id: 'sh1',
      guestOrgId: GUEST,
      status: 'PENDING',
    });
  });

  it('accepting makes it ACTIVE and records who; declining grants nothing', async () => {
    const { prisma, svc } = setup();
    prisma.spaceShare.findFirst.mockResolvedValue({ id: 'sh1' });
    await svc.respondToShare({ guestOrgId: GUEST, shareId: 'sh1', accept: true, userId: 'g1' });
    await svc.respondToShare({ guestOrgId: GUEST, shareId: 'sh1', accept: false, userId: 'g1' });
    expect(prisma.spaceShare.update.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', acceptedById: 'g1' });
    expect(prisma.spaceShare.update.mock.calls[1][0].data).toEqual({ status: 'DECLINED' });
  });

  it('the incoming list is pending and active shares only, for its own organization', async () => {
    const { prisma, svc } = setup();
    await svc.listIncoming({ guestOrgId: GUEST });
    expect(prisma.spaceShare.findMany.mock.calls[0][0].where).toEqual({
      guestOrgId: GUEST,
      status: { in: ['PENDING', 'ACTIVE'] },
    });
  });
});

describe('requests from a guest', () => {
  const ask = { guestOrgId: GUEST, userId: 'g1', shareId: 'sh1', type: 'TASK' as const, title: '  Fix the gate  ' };

  it('need an ACTIVE share of the guest, that allows requests', async () => {
    const { prisma, svc } = setup();
    expect(await svc.createRequest(ask)).toMatchObject({ statusCode: 404 });
    expect(prisma.spaceShare.findFirst.mock.calls[0][0].where).toEqual({
      id: 'sh1',
      guestOrgId: GUEST,
      status: 'ACTIVE',
    });
    prisma.spaceShare.findFirst.mockResolvedValueOnce({ id: 'sh1', spaceId: 'sp1', allowRequests: false });
    expect(await svc.createRequest(ask)).toMatchObject({ statusCode: 403 });
    expect(prisma.spaceShareRequest.create).not.toHaveBeenCalled();
  });

  it('need a title; the text is trimmed and capped, an unknown type is a TASK', async () => {
    const { prisma, svc } = setup();
    prisma.spaceShare.findFirst.mockResolvedValue({ id: 'sh1', spaceId: 'sp1', allowRequests: true });
    expect(await svc.createRequest({ ...ask, title: '   ' })).toMatchObject({ statusCode: 400 });
    await svc.createRequest({ ...ask, type: 'MONEY' as any, note: 'x'.repeat(2000) });
    expect(prisma.spaceShareRequest.create.mock.calls[0][0].data).toMatchObject({
      spaceId: 'sp1',
      type: 'TASK',
      title: 'Fix the gate',
      note: 'x'.repeat(1000),
    });
  });

  it('the owner lists them for its own workspace; the guest only its own; nobody else at all', async () => {
    const { prisma, svc } = setup();
    expect(await svc.listRequests({ spaceId: 'sp1', ownerOrgId: 'org-x' })).toMatchObject({ statusCode: 404 });
    await svc.listRequests({ spaceId: 'sp1', guestOrgId: GUEST, status: 'PENDING' });
    expect(prisma.spaceShareRequest.findMany.mock.calls[0][0].where).toEqual({
      spaceId: 'sp1',
      guestOrgId: GUEST,
      status: 'PENDING',
    });
    expect(await svc.listRequests({ spaceId: 'sp1' })).toMatchObject({ statusCode: 404 });
    expect(prisma.spaceShareRequest.findMany).toHaveBeenCalledTimes(1);
  });

  it("the owner decides once, and only for its own workspace's requests", async () => {
    const { prisma, svc } = setup();
    expect(
      await svc.resolveRequest({ ownerOrgId: OWNER, requestId: 'rq1', approve: true, userId: 'u1' }),
    ).toMatchObject({
      statusCode: 404,
    });
    prisma.spaceShareRequest.findFirst.mockResolvedValueOnce({ id: 'rq1', spaceId: 'sp1' });
    expect(
      await svc.resolveRequest({ ownerOrgId: 'org-x', requestId: 'rq1', approve: true, userId: 'x' }),
    ).toMatchObject({
      statusCode: 403,
    });
    prisma.spaceShareRequest.findFirst.mockResolvedValueOnce({ id: 'rq1', spaceId: 'sp1' });
    await svc.resolveRequest({ ownerOrgId: OWNER, requestId: 'rq1', approve: false, userId: 'u1' });
    expect(prisma.spaceShareRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'REJECTED',
      resolvedById: 'u1',
    });
    expect(prisma.spaceShareRequest.update).toHaveBeenCalledTimes(1);
  });
});
