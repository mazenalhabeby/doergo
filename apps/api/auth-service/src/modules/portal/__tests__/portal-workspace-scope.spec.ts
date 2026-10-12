import { NotFoundException } from '@nestjs/common';
import { PortalService } from '../portal.service';

/*
  The customer portal honoured PER WORKSPACE.

  The gateway guard (`@RequirePermissionInSpace`) only knows a portal key is
  held SOMEWHERE; the service is the boundary. Every office method takes
  `scopeSpaceIds` — the workspaces granting the route's key — and:

    undefined   org-wide: the organization is the only fence
    ['A']       only what lives in workspace A (a portal's workspace, a unit's,
                its client's or its portal's, a category's portal's)
    []          granted nowhere: NOTHING, never "everything"

  Refusals are 404, the answer a missing record gets.

  The database below is an in-memory fake that evaluates the `where` the service
  actually builds (equality, `in`, OR/AND, the relations the service walks), so
  these tests fail if a query stops narrowing — not if it is merely phrased
  differently.
*/

const ORG = 'org-1';

type Row = Record<string, any>;
type Tables = Record<'portal' | 'customer' | 'customerUnit' | 'intakeCategory' | 'companyLocation', Row[]>;

const RELATIONS: Record<string, Record<string, [keyof Tables, string]>> = {
  customer: { portal: ['portal', 'portalId'] },
  customerUnit: { customer: ['customer', 'customerId'], portal: ['portal', 'portalId'] },
  intakeCategory: { portal: ['portal', 'portalId'] },
};

function matches(db: Tables, model: string, row: Row, where: Row = {}): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (k === 'OR') {
      if (!(v as Row[]).some((w) => matches(db, model, row, w))) return false;
      continue;
    }
    if (k === 'AND') {
      if (!(v as Row[]).every((w) => matches(db, model, row, w))) return false;
      continue;
    }
    const rel = RELATIONS[model]?.[k];
    if (rel) {
      const [table, fk] = rel;
      const related = db[table].find((r) => r.id === row[fk]);
      if (!related || !matches(db, table, related, v)) return false;
      continue;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if ('in' in v && !(v.in as unknown[]).includes(row[k])) return false;
      if ('not' in v && row[k] === v.not) return false;
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
}

function fakePrisma(db: Tables) {
  const writes: string[] = [];
  const model = (name: keyof Tables) => ({
    findFirst: jest.fn(async ({ where }: any) => db[name].find((r) => matches(db, name, r, where)) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => db[name].filter((r) => matches(db, name, r, where))),
    findUnique: jest.fn(async ({ where }: any) => db[name].find((r) => r.id === where.id) ?? null),
    count: jest.fn(async ({ where }: any = {}) => db[name].filter((r) => matches(db, name, r, where)).length),
    groupBy: jest.fn(async () => []),
    create: jest.fn(async ({ data }: any) => {
      writes.push(`${name}.create`);
      const row = { id: `${name}-new`, ...data };
      db[name].push(row);
      return row;
    }),
    createMany: jest.fn(async () => ({ count: 0 })),
    update: jest.fn(async ({ where, data }: any) => {
      writes.push(`${name}.update`);
      const row = db[name].find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    updateMany: jest.fn(async () => {
      writes.push(`${name}.updateMany`);
      return { count: 0 };
    }),
    delete: jest.fn(async () => {
      writes.push(`${name}.delete`);
      return {};
    }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  });
  const prisma: any = {
    portal: model('portal'),
    customer: model('customer'),
    customerUnit: model('customerUnit'),
    intakeCategory: model('intakeCategory'),
    companyLocation: model('companyLocation'),
    user: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    unitActivity: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    invitation: { updateMany: jest.fn() },
    organization: { update: jest.fn() },
    $transaction: jest.fn(async (ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
  };
  return { prisma, writes };
}

function setup() {
  const db: Tables = {
    companyLocation: [
      { id: 'A', organizationId: ORG },
      { id: 'B', organizationId: ORG },
    ],
    portal: [
      { id: 'pA', organizationId: ORG, spaceId: 'A', isActive: true, name: 'A' },
      { id: 'pB', organizationId: ORG, spaceId: 'B', isActive: true, name: 'B' },
      { id: 'pOrg', organizationId: ORG, spaceId: null, isActive: true, name: 'Org level' },
    ],
    customer: [
      { id: 'cA', organizationId: ORG, spaceId: 'A', portalId: 'pA', isPortalResident: true },
      { id: 'cB', organizationId: ORG, spaceId: 'B', portalId: 'pB', isPortalResident: true },
    ],
    customerUnit: [
      { id: 'uA', organizationId: ORG, spaceId: 'A', portalId: 'pA', customerId: 'cA', isActive: true },
      { id: 'uB', organizationId: ORG, spaceId: 'B', portalId: 'pB', customerId: 'cB', isActive: true },
      { id: 'uLooseA', organizationId: ORG, spaceId: 'A', portalId: null, customerId: null, isActive: true },
    ],
    intakeCategory: [
      { id: 'catA', organizationId: ORG, portalId: 'pA', isActive: true },
      { id: 'catB', organizationId: ORG, portalId: 'pB', isActive: true },
    ],
  };
  const { prisma, writes } = fakePrisma(db);
  const service = new PortalService(prisma, {} as any);
  return { service, prisma, writes, db };
}

const A = ['A'];
const ids = (rows: Row[]) => rows.map((r) => r.id).sort();

describe('portals — read only in the workspaces granting the key', () => {
  it('a workspace answerer lists their workspace’s portals and nothing else', async () => {
    const { service } = setup();
    expect(ids((await service.listPortals({ organizationId: ORG, scopeSpaceIds: A })) as Row[])).toEqual(['pA']);
  });

  it('granted nowhere ([]) lists NOTHING — never the organization', async () => {
    const { service } = setup();
    expect(await service.listPortals({ organizationId: ORG, scopeSpaceIds: [] })).toEqual([]);
  });

  it('org-wide (undefined) lists every portal, organization-level included', async () => {
    const { service } = setup();
    expect(ids((await service.listPortals({ organizationId: ORG })) as Row[])).toEqual(['pA', 'pB', 'pOrg']);
  });

  it('a workspace tab asking for ANOTHER workspace gets nothing', async () => {
    const { service } = setup();
    expect(await service.listPortals({ organizationId: ORG, spaceId: 'B', scopeSpaceIds: A })).toEqual([]);
  });

  it('another workspace’s portal by id is 404; so is an organization-level one', async () => {
    const { service } = setup();
    await expect(service.getPortal({ id: 'pB', organizationId: ORG, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPortal({ id: 'pOrg', organizationId: ORG, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPortal({ id: 'pA', organizationId: ORG, scopeSpaceIds: A })).resolves.toMatchObject({ id: 'pA' });
    await expect(service.getPortal({ id: 'pOrg', organizationId: ORG })).resolves.toMatchObject({ id: 'pOrg' });
  });
});

describe('configuring — only the caller’s workspace’s portal', () => {
  it('cannot rename / restyle another workspace’s portal', async () => {
    const { service, writes } = setup();
    await expect(service.updatePortal({ id: 'pB', organizationId: ORG, name: 'x', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
  });

  it('cannot carry their portal into another workspace, or up to organization level', async () => {
    const { service, writes } = setup();
    await expect(service.updatePortal({ id: 'pA', organizationId: ORG, spaceId: 'B', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updatePortal({ id: 'pA', organizationId: ORG, spaceId: null, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
  });

  it('may configure their own', async () => {
    const { service, writes } = setup();
    await expect(service.updatePortal({ id: 'pA', organizationId: ORG, name: 'Renamed', scopeSpaceIds: A })).resolves.toMatchObject({ name: 'Renamed' });
    expect(writes).toEqual(['portal.update']);
  });

  it('cannot delete another workspace’s portal', async () => {
    const { service, writes } = setup();
    await expect(service.deletePortal({ id: 'pB', organizationId: ORG, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
  });

  it('categories: another workspace’s portal is out of reach; routing into another workspace is refused', async () => {
    const { service, writes } = setup();
    await expect(service.updateCategory({ id: 'catB', organizationId: ORG, label: 'x', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteCategory({ id: 'catB', organizationId: ORG, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateCategory({ id: 'catA', organizationId: ORG, spaceId: 'B', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createCategory({ organizationId: ORG, portalId: 'pB', key: 'k', label: 'K', scopeSpaceIds: A }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createCategory({ organizationId: ORG, portalId: 'pA', key: 'k', label: 'K', spaceId: 'B', scopeSpaceIds: A }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.reorderCategories({ organizationId: ORG, portalId: 'pB', orderedIds: ['catB'], scopeSpaceIds: A }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
  });
});

describe('units and residents — the same fence', () => {
  it('another workspace’s unit is 404 to read, edit, delete or annotate', async () => {
    const { service, writes } = setup();
    await expect(service.getUnit({ id: 'uB', organizationId: ORG, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listUnitActivities({ id: 'uB', organizationId: ORG, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addUnitActivity({ id: 'uB', organizationId: ORG, body: 'n', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateUnit({ id: 'uB', organizationId: ORG, name: 'x', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteUnit({ id: 'uB', organizationId: ORG, scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
  });

  it('a unit filed in the workspace with no client or portal yet is reachable by that workspace', async () => {
    const { service } = setup();
    await expect(service.getUnit({ id: 'uLooseA', organizationId: ORG, scopeSpaceIds: A })).resolves.toMatchObject({ data: { id: 'uLooseA' } });
  });

  it('cannot hand their unit to another workspace’s client, or move it out', async () => {
    const { service, writes } = setup();
    await expect(service.updateUnit({ id: 'uA', organizationId: ORG, customerId: 'cB', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateUnit({ id: 'uA', organizationId: ORG, spaceId: 'B', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateUnit({ id: 'uA', organizationId: ORG, portalId: 'pB', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
  });

  it('a scoped create must be filed somewhere they run', async () => {
    const { service, writes } = setup();
    await expect(service.createUnit({ organizationId: ORG, name: 'Flat', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createUnit({ organizationId: ORG, name: 'Flat', spaceId: 'B', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    expect(writes).toEqual([]);
    await expect(service.createUnit({ organizationId: ORG, name: 'Flat', spaceId: 'A', scopeSpaceIds: A })).resolves.toMatchObject({ spaceId: 'A' });
  });

  it('admin unit list narrows to the workspace', async () => {
    const { service } = setup();
    expect(ids(await service.listUnits({ organizationId: ORG, scopeSpaceIds: A }))).toEqual(['uA', 'uLooseA']);
    expect(await service.listUnits({ organizationId: ORG, scopeSpaceIds: [] })).toEqual([]);
  });

  it('cannot remove another workspace’s resident from their portal', async () => {
    const { service, prisma } = setup();
    await expect(service.removePortalClient({ organizationId: ORG, customerId: 'cB', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('invite pickers for another workspace’s portal are 404', async () => {
    const { service } = setup();
    await expect(service.listAvailableUnitsForPortal({ organizationId: ORG, portalId: 'pB', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listAssignableCustomersForPortal({ organizationId: ORG, portalId: 'pB', scopeSpaceIds: A })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('assertPortalReach — the gateway’s question before calling the CRM / invitations', () => {
  it('portal, client and unit must all be in reach', async () => {
    const { service } = setup();
    await expect(service.assertPortalReach({ organizationId: ORG, scopeSpaceIds: A, portalId: 'pB' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertPortalReach({ organizationId: ORG, scopeSpaceIds: A, portalId: 'pA', customerId: 'cB' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertPortalReach({ organizationId: ORG, scopeSpaceIds: A, customerId: 'cB' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertPortalReach({ organizationId: ORG, scopeSpaceIds: A, portalId: 'pA', unitId: 'uB' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.assertPortalReach({ organizationId: ORG, scopeSpaceIds: A, portalId: 'pA', customerId: 'cA', unitId: 'uA' })).resolves.toMatchObject({
      data: { portalId: 'pA', spaceId: 'A' },
    });
  });

  it('granted nowhere reaches nothing', async () => {
    const { service } = setup();
    await expect(service.assertPortalReach({ organizationId: ORG, scopeSpaceIds: [], portalId: 'pA' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('org-wide reaches an organization-level portal', async () => {
    const { service } = setup();
    await expect(service.assertPortalReach({ organizationId: ORG, portalId: 'pOrg', customerId: 'cB' })).resolves.toBeDefined();
  });
});
