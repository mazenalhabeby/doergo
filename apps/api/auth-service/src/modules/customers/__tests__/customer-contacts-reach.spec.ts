import { customerServices } from './customer-services.fixture';

/*
  Listing a link reads BOTH sides through reach.

  `listContacts` / `listContactCompanies` checked the side the caller asked
  about and returned the other side's details (name, phone, email) for every
  linked record. A rep who reaches a company read the details of contact
  people they could not open. Out-of-reach people are left out and counted.
*/

const ORG = 'org-1';
const repRow = {
  role: 'EMPLOYEE',
  organizationId: ORG,
  isExternal: false,
  organization: { enabledModules: ['crm'] },
  memberRole: { permissions: { crmViewOwn: true }, isActive: true },
  spaceAssignments: [],
};
const mine = { spaceId: null, ownerId: 'rep', managerIds: [] };
const theirs = { spaceId: null, ownerId: 'other', managerIds: [] };

function setup(rows: unknown[]) {
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(repRow) },
    customer: {
      findFirst: jest.fn(async ({ where }: any) => ({ id: where.id, isPortalResident: false, ...mine })),
    },
    customerContact: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  return customerServices(prisma);
}

const rep = { userId: 'rep', role: 'EMPLOYEE' };

describe('contact lists show only people the caller reaches', () => {
  it('a company’s contacts: the out-of-reach person is left out, and counted', async () => {
    const service = setup([
      { id: 'l1', role: null, isPrimary: true, person: { id: 'p1', name: 'Mine', email: 'm@x', ...mine } },
      { id: 'l2', role: null, isPrimary: false, person: { id: 'p2', name: 'Hidden', email: 'h@x', ...theirs } },
    ]);
    const res: any = await service.listContacts({ companyId: 'co', organizationId: ORG, caller: rep });
    expect(res.data.map((r: any) => r.person.id)).toEqual(['p1']);
    expect(res.hidden).toBe(1);
    expect(JSON.stringify(res)).not.toContain('Hidden');
    // The fields read to decide reach are not handed out.
    expect(res.data[0].person).not.toHaveProperty('ownerId');
  });

  it('a person’s companies: the out-of-reach company is left out', async () => {
    const service = setup([
      { id: 'l1', role: null, isPrimary: true, company: { id: 'c1', name: 'Mine Co', industry: null, ...mine } },
      { id: 'l2', role: null, isPrimary: false, company: { id: 'c2', name: 'Other Co', industry: null, ...theirs } },
    ]);
    const res: any = await service.listContactCompanies({ personId: 'p', organizationId: ORG, caller: rep });
    expect(res.data.map((r: any) => r.company.id)).toEqual(['c1']);
    expect(res.hidden).toBe(1);
  });
});
