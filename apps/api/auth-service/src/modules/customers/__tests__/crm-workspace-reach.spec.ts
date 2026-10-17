import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomersService } from '../customers.service';
import { customerServices, type CustomerServices } from './customer-services.fixture';

/*
  CRM permissions honoured PER WORKSPACE — through the real CustomersService,
  with the caller's row read the way the service reads it (crmReachSelect).

  A space-only member (internal, or an external member whose whole authority is
  one workspace's role) reaches the clients filed in THAT workspace, never
  another one and never the ones filed nowhere — and every refusal for a client
  out of reach is a 404, exactly like a client that does not exist.
*/

const ORG = 'org-1';
const space = (over: Record<string, unknown> = {}) => ({ organizationId: ORG, isActive: true, enabledModules: null, ...over });
const assignment = (spaceId: string, permissions: Record<string, boolean>, spaceOver: Record<string, unknown> = {}) => ({
  spaceId,
  role: { permissions, isActive: true },
  space: space(spaceOver),
});

/** The caller's row as `crmReachSelect` reads it. */
const memberRow = (opts: { org?: Record<string, boolean>; spaces?: ReturnType<typeof assignment>[]; isExternal?: boolean } = {}) => ({
  role: 'EMPLOYEE',
  organizationId: ORG,
  isExternal: !!opts.isExternal,
  organization: { enabledModules: ['crm'] },
  memberRole: opts.org ? { permissions: opts.org, isActive: true } : null,
  spaceAssignments: opts.spaces ?? [],
});

const clients: Record<string, any> = {
  inA: { id: 'inA', name: 'In A', spaceId: 'A', ownerId: 'someone', managerIds: [], status: 'LEAD', isPortalResident: false },
  inB: { id: 'inB', name: 'In B', spaceId: 'B', ownerId: 'someone', managerIds: [], status: 'LEAD', isPortalResident: false },
  unfiled: { id: 'unfiled', name: 'Nowhere', spaceId: null, ownerId: 'someone', managerIds: [], status: 'LEAD', isPortalResident: false },
};

function setup(row: unknown) {
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(row), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    customer: {
      findFirst: jest.fn(async ({ where }: any) => (where.organizationId === ORG ? clients[where.id] ?? null : null)),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ ...clients[where.id], ...data })),
    },
    customerContact: { findMany: jest.fn().mockResolvedValue([]) },
    customerActivity: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    companyLocation: { findFirst: jest.fn(async ({ where }: any) => ({ id: where.id })) },
    portal: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async () => []),
  };
  const service = customerServices(prisma);
  // The company lookup is the invoices' rule and not under test here.
  (service as any).clientCompany = async () => undefined;
  return { service, prisma };
}

const me = { userId: 'me', role: 'EMPLOYEE' };

describe('CRM per workspace — a space-only viewer', () => {
  const row = memberRow({ spaces: [assignment('A', { crmViewAll: true })] });

  it('the list is narrowed to their workspace', async () => {
    const { service, prisma } = setup(row);
    await service.list({ organizationId: ORG, caller: me });
    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.AND).toContainEqual({ spaceId: { in: ['A'] } });
    // The count is asked with the same where, so the total cannot count past it.
    expect(prisma.customer.count.mock.calls[0][0].where).toBe(where);
  });

  it('opens a client of their workspace', async () => {
    const { service } = setup(row);
    const res: any = await service.get('inA', ORG, me);
    expect(res.data.id).toBe('inA');
    expect(res.data.crmCaps.view).toBe('all');
  });

  it('cannot see a client of another workspace, nor one filed nowhere — 404, like a missing id', async () => {
    const { service } = setup(row);
    await expect(service.get('inB', ORG, me)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get('unfiled', ORG, me)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('their timeline and contacts follow the same rule', async () => {
    const { service } = setup(row);
    await expect(service.listActivities({ customerId: 'inB', organizationId: ORG, caller: me })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listContacts({ companyId: 'unfiled', organizationId: ORG, caller: me })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listActivities({ customerId: 'inA', organizationId: ORG, caller: me })).resolves.toBeDefined();
  });

  it('a workspace that switched the CRM off grants nothing there', async () => {
    const { service } = setup(memberRow({ spaces: [assignment('A', { crmViewAll: true }, { enabledModules: ['tasks'] })] }));
    await expect(service.list({ organizationId: ORG, caller: me })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.get('inA', ORG, me)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a space manager\'s canViewAllTasks / canManageUsers are not a CRM grant', async () => {
    const { service } = setup(memberRow({ spaces: [assignment('A', { canViewAllTasks: true, canManageUsers: true })] }));
    await expect(service.get('inA', ORG, me)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CRM per workspace — creating and moving', () => {
  const row = memberRow({ spaces: [assignment('A', { crmViewAll: true, crmEditInfo: true, crmCreateClients: true }), assignment('B', { crmViewAll: true })] });

  it('create needs THEIR workspace: none is 400, another is 403, theirs is filed there', async () => {
    const { service, prisma } = setup(row);
    await expect(service.create(ORG, { name: 'X' }, me)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(ORG, { name: 'X', spaceId: 'B' }, me)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.customer.create).not.toHaveBeenCalled();
    const res: any = await service.create(ORG, { name: 'X', spaceId: 'A' }, me);
    expect(prisma.customer.create.mock.calls[0][0].data.spaceId).toBe('A');
    expect(res.data.name).toBe('X');
  });

  it('cannot move a client out to a workspace they lack the right in, nor file it nowhere', async () => {
    const { service, prisma } = setup(row);
    await expect(service.update('inA', ORG, { spaceId: 'B' }, 'me', me)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update('inA', ORG, { spaceId: null }, 'me', me)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('can edit within their workspace; a view-only workspace is 403, not 404', async () => {
    const { service, prisma } = setup(row);
    await service.update('inA', ORG, { phone: '+43 1' }, 'me', me);
    expect(prisma.customer.update).toHaveBeenCalledTimes(1);
    await expect(service.update('inB', ORG, { phone: '+43 1' }, 'me', me)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delete and reassign need manage where the client is filed', async () => {
    const { service } = setup(row);
    await expect(service.remove('inA', ORG, me)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update('inA', ORG, { ownerId: 'me' }, 'me', me)).rejects.toBeInstanceOf(ForbiddenException);
    const manager = setup(memberRow({ spaces: [assignment('A', { crmManageClients: true })] }));
    await expect(manager.service.remove('inA', ORG, me)).resolves.toMatchObject({ success: true });
    await expect(manager.service.remove('inB', ORG, me)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CRM per workspace — an external member', () => {
  const ext = memberRow({
    isExternal: true,
    // Whatever an org role says, an external member holds nothing org-wide.
    org: { crmViewAll: true, crmManageClients: true },
    spaces: [assignment('A', { crmViewAll: true, crmWork: true, crmEditInfo: true })],
  });

  it('reaches workspace A', async () => {
    const { service } = setup(ext);
    await expect(service.get('inA', ORG, me)).resolves.toBeDefined();
  });

  it('cannot reach workspace B, or the unfiled clients — every door answers 404', async () => {
    const { service } = setup(ext);
    await expect(service.get('inB', ORG, me)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('inB', ORG, { phone: '1' }, 'me', me)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('inB', ORG, { ownerId: 'me' }, 'me', me)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('inB', ORG, me)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addActivity({ customerId: 'unfiled', organizationId: ORG, body: 'x', caller: me })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the list never widens past A', async () => {
    const { service, prisma } = setup(ext);
    await service.list({ organizationId: ORG, caller: me, spaceId: 'B' });
    expect(prisma.customer.findMany.mock.calls[0][0].where.AND).toContainEqual({ spaceId: { in: ['A'] } });
  });
});

describe('CRM per workspace — internal org-wide behaviour is unchanged', () => {
  it('org-wide view-all reaches every workspace and the unfiled, the list is not narrowed', async () => {
    const { service, prisma } = setup(memberRow({ org: { crmViewAll: true } }));
    for (const id of ['inA', 'inB', 'unfiled']) await expect(service.get(id, ORG, me)).resolves.toBeDefined();
    await service.list({ organizationId: ORG, caller: me });
    expect(prisma.customer.findMany.mock.calls[0][0].where.AND).toEqual([{}]);
  });

  it('org-wide create may file a client nowhere', async () => {
    const { service, prisma } = setup(memberRow({ org: { crmCreateClients: true } }));
    await service.create(ORG, { name: 'Y' }, me);
    expect(prisma.customer.create.mock.calls[0][0].data.spaceId).toBeNull();
  });

  it('the legacy org-wide bridge still applies (a manager role without crm keys)', async () => {
    const { service } = setup(memberRow({ org: { canManageUsers: true } }));
    await expect(service.remove('inB', ORG, me)).resolves.toMatchObject({ success: true });
  });
});
