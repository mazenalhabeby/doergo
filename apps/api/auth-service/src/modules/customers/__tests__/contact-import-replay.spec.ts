import { Test, TestingModule } from '@nestjs/testing';
import { type CrmCaps, NO_CRM_CAPS, PrismaService } from '@hbcfield/shared';
import { CustomersService } from '../customers.service';
import { CrmReachService } from '../crm-reach.service';
import { ContactImportService } from '../contact-import.service';

/*
  A retried import (a ref already used) answers only for a client the caller
  still reaches. A ref naming another rep's client returned that client's NAME
  with no reach check — an id is not a key. And a replayed company is judged
  where it IS filed, not where this import files new clients.
*/

const ORG = 'org-1';
const ref = (n: number) => `0190a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;
const caps = (over: Partial<CrmCaps> = {}): CrmCaps => ({
  view: 'all',
  work: true,
  editInfo: true,
  create: true,
  manage: false,
  canAccess: true,
  ...over,
});

describe('contact import replay', () => {
  let service: ContactImportService;
  let customers: CustomersService;
  const prisma: Record<string, any> = {
    customer: { findMany: jest.fn(), createMany: jest.fn((a) => ({ op: 'createMany', a })) },
    customerContact: { createMany: jest.fn((a) => ({ op: 'links', a })) },
    customerActivity: { createMany: jest.fn((a) => ({ op: 'activities', a })) },
    companyLocation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const caller = { userId: 'u1', role: 'MEMBER' };
  const run = (items: any[]) => service.import({ organizationId: ORG, caller, body: { spaceId: 'sp-1', items } });
  const op = (name: string) => (prisma.$transaction.mock.calls[0][0] as any[]).find((o) => o.op === name)?.a;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.customer.findMany.mockReset();
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 'sp-1' });
    prisma.user.findFirst.mockResolvedValue({ firstName: 'Anna', lastName: 'M' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactImportService, CustomersService, CrmReachService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ContactImportService);
    customers = module.get(CustomersService);
  });

  it('a ref naming a client out of reach is skipped, and its name is not told', async () => {
    jest.spyOn(customers, 'crmReachFor').mockResolvedValue({ org: caps({ view: 'own' }), spaces: {} });
    prisma.customer.findMany
      .mockResolvedValueOnce([
        { id: ref(1), organizationId: ORG, name: 'Secret GmbH', spaceId: null, ownerId: 'other', managerIds: [] },
      ])
      .mockResolvedValueOnce([]);
    const r = await run([{ ref: ref(1), kind: 'PERSON', name: 'Typed' }]);
    expect(r.data.results[0]).toMatchObject({ outcome: 'skipped', reason: 'NOT_YOURS', name: 'Typed' });
    expect(JSON.stringify(r.data)).not.toContain('Secret GmbH');
  });

  it('a replayed company is judged where it is filed: no edit there, no link', async () => {
    jest.spyOn(customers, 'crmReachFor').mockResolvedValue({
      org: NO_CRM_CAPS,
      spaces: { 'sp-1': caps(), 'sp-2': caps({ editInfo: false, create: false }) },
    });
    prisma.customer.findMany
      .mockResolvedValueOnce([
        { id: ref(1), organizationId: ORG, name: 'Firm', spaceId: 'sp-2', ownerId: null, managerIds: [] },
      ])
      .mockResolvedValueOnce([]);
    const r = await run([
      { ref: ref(1), kind: 'COMPANY', name: 'Firm' },
      { ref: ref(2), kind: 'PERSON', name: 'Eva', companyRef: ref(1) },
    ]);
    expect(r.data.results.find((x: any) => x.ref === ref(1))).toMatchObject({ outcome: 'created', id: ref(1) });
    expect(op('links')).toBeUndefined();
  });
});
