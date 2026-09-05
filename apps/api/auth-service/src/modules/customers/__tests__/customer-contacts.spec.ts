import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomersService } from '../customers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BILLABLE_CLIENT_WHERE } from '@hbcfield/shared';

/*
  A contact person is a LINK between two client records, and a link is a way to
  reach a record you were not shown. That is the whole risk here, so most of what
  follows is about refusing: another tenant's id, another workspace's client, a
  company as somebody's contact, a client as its own contact.

  The rest is about the second hazard, which is money — a company with six
  contacts is not six clients, and the CRM ladder charges per client.
*/

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

describe('contact people', () => {
  let service: CustomersService;

  const prisma: Record<string, any> = {
    customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    customerContact: {
      findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(),
      update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (tx: Record<string, any>) => unknown) => cb(prisma)),
  };

  /** A caller with full CRM rights unless a test says otherwise. */
  const admin = { userId: 'u1', role: 'ADMIN' };

  const company = (over: Record<string, unknown> = {}) => ({
    id: 'co-1', name: 'AGRU', type: 'COMPANY', spaceId: 'sp-1', isContact: false,
    ownerId: null, managerIds: [], isPortalResident: false, ...over,
  });
  const person = (over: Record<string, unknown> = {}) => ({
    id: 'pe-1', name: 'Anna', type: 'PERSON', spaceId: 'sp-1', isContact: false,
    ownerId: null, managerIds: [], isPortalResident: false, ...over,
  });

  /** Resolve findFirst by id, the way the service reaches each side. */
  const records = (...rows: Array<Record<string, unknown>>) => {
    prisma.customer.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(rows.find((r) => r.id === where.id && where.organizationId === ORG) ?? null),
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: (tx: Record<string, any>) => unknown) => cb(prisma));
    prisma.customerContact.upsert.mockResolvedValue({ id: 'lnk-1', role: null, isPrimary: false, person: person() });
    // No reverse link unless a test says there is one.
    prisma.customerContact.findUnique.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CustomersService);
  });

  const add = (over: Record<string, unknown> = {}) =>
    service.addContact({ companyId: 'co-1', personId: 'pe-1', organizationId: ORG, caller: admin, ...over } as never);

  describe('refusing', () => {
    it('will not reach a record in another organization', async () => {
      /*
        The ids are always attacker-controlled. Both sides are loaded WITH the
        organization filter, so an id from another tenant resolves to nothing —
        the check IS the query, not a comparison after it.
      */
      records(company(), person());
      await expect(
        service.addContact({ companyId: 'co-1', personId: 'pe-1', organizationId: OTHER_ORG, caller: admin } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('says "not found" rather than "not allowed" for a client out of scope', async () => {
      // A rep who sees only their own clients must not learn which client ids
      // exist by watching 403s come back instead of 404s.
      prisma.user.findFirst.mockResolvedValue({ role: 'MEMBER', memberRole: { permissions: { crmViewOwn: true, crmEditInfo: true } } });
      records(company({ ownerId: 'someone-else' }), person());
      await expect(add({ caller: { userId: 'u1', role: 'MEMBER' } })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does NOT refuse a client saved with the wrong type', async () => {
      /*
        The `type` column used to gate this, and it made the whole feature
        invisible: a real book of clients reads "BILLA AG", "Siemens AG",
        "voestalpine" — every one saved as PERSON, because the Person/Company
        toggle is an afterthought when somebody adds a client in a hurry.

        Refusing those would have meant the panel appeared on none of the records
        that need it, and the customer would have had to re-type their whole book
        to earn the feature. The two ends are told apart by their POSITION in the
        link, not by a field that may never have been set.
      */
      records(person({ id: 'co-1', name: 'BILLA AG' }), person());
      await expect(add()).resolves.toBeDefined();
    });

    it('will not let two clients each be the other’s contact', async () => {
      // It renders as two panels each claiming the other reports to it, and
      // there is no reading of the relationship in which both are true.
      records(company(), person());
      prisma.customerContact.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(add()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('will not make a client its own contact', async () => {
      records(company(), person({ id: 'co-1', type: 'COMPANY' }));
      await expect(add({ personId: 'co-1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('will not link across workspaces', async () => {
      /*
        Clients are listed per workspace and a rep's book is a workspace's book.
        Linking across them would pull a client into a space somebody can see,
        with no screen showing that it happened.
      */
      records(company({ spaceId: 'sp-1' }), person({ spaceId: 'sp-2' }));
      await expect(add()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows a client that belongs to no workspace', async () => {
      // Legacy, org-level records belong to all of them.
      records(company({ spaceId: 'sp-1' }), person({ spaceId: null }));
      await expect(add()).resolves.toBeDefined();
    });

    it('needs edit rights to link, and create rights to invent a person', async () => {
      // Two different abilities, matching the rules this service already has:
      // linking edits the company's details; creating a person creates a client.
      prisma.user.findFirst.mockResolvedValue({ role: 'MEMBER', memberRole: { permissions: { crmViewAll: true } } });
      records(company(), person());
      await expect(add({ caller: { userId: 'u1', role: 'MEMBER' } })).rejects.toBeInstanceOf(ForbiddenException);

      prisma.user.findFirst.mockResolvedValue({ role: 'MEMBER', memberRole: { permissions: { crmViewAll: true, crmEditInfo: true } } });
      await expect(
        service.addContact({ companyId: 'co-1', person: { name: 'New Person' }, organizationId: ORG, caller: { userId: 'u1', role: 'MEMBER' } } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('adding', () => {
    it('is safe to click twice', async () => {
      /*
        An upsert against the unique pair, not a check-then-insert — the second
        click of a double-click can slip between those two statements, and the
        database is the only thing that cannot be raced.
      */
      records(company(), person());
      await add();
      expect(prisma.customerContact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId_personId: { companyId: 'co-1', personId: 'pe-1' } } }),
      );
    });

    it('clears the previous primary in the SAME transaction', async () => {
      // Two primaries and none are both silent breakage — one shows two stars,
      // the other looks identical to "nobody set yet".
      records(company(), person());
      await add({ isPrimary: true });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.customerContact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'co-1', isPrimary: true }, data: { isPrimary: false } }),
      );
    });

    it('does not touch the primary when it was not asked to', async () => {
      records(company(), person());
      await add();
      expect(prisma.customerContact.updateMany).not.toHaveBeenCalled();
    });

    it('marks a newly created person as a contact, in the company’s workspace', async () => {
      records(company({ spaceId: 'sp-9' }));
      prisma.customer.create.mockResolvedValue({ id: 'new-1' });
      await service.addContact({ companyId: 'co-1', person: { name: 'Tomas' }, organizationId: ORG, caller: admin } as never);
      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'PERSON', isContact: true, spaceId: 'sp-9', organizationId: ORG }),
        }),
      );
    });

    it('refuses a nameless person', async () => {
      records(company());
      await expect(
        service.addContact({ companyId: 'co-1', person: { name: '   ' }, organizationId: ORG, caller: admin } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('removing', () => {
    it('detaches the link and keeps the person', async () => {
      // They may work somewhere else tomorrow, and their history is worth having
      // either way. Removing the relationship is the whole action.
      prisma.customerContact.findFirst.mockResolvedValue({ id: 'lnk-1', companyId: 'co-1' });
      records(company());
      await service.removeContact({ linkId: 'lnk-1', organizationId: ORG, caller: admin } as never);
      expect(prisma.customerContact.delete).toHaveBeenCalledWith({ where: { id: 'lnk-1' } });
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('refuses a link belonging to another organization', async () => {
      prisma.customerContact.findFirst.mockResolvedValue(null);
      await expect(
        service.removeContact({ linkId: 'lnk-1', organizationId: ORG, caller: admin } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the bill', () => {
    it('does not count a contact as a client', () => {
      /*
        The CRM ladder charges per active client — 50 free, then €0.30. A firm
        with six contacts is not six clients, and thirty such firms would cross
        the allowance for people who buy nothing.
      */
      expect(BILLABLE_CLIENT_WHERE).toEqual({ isActive: true, isContact: false });
    });

    it('counts them from the moment they become a client', async () => {
      records(person({ isContact: true }));
      await service.promoteContact({ personId: 'pe-1', organizationId: ORG, caller: admin } as never);
      expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'pe-1' }, data: { isContact: false } });
    });

    it('needs the right to create clients to promote one', async () => {
      // It puts somebody on the bill, so it takes what adding a client takes.
      prisma.user.findFirst.mockResolvedValue({ role: 'MEMBER', memberRole: { permissions: { crmViewAll: true, crmEditInfo: true } } });
      records(person({ isContact: true }));
      await expect(
        service.promoteContact({ personId: 'pe-1', organizationId: ORG, caller: { userId: 'u1', role: 'MEMBER' } } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

/*
  Moving a client between workspaces.

  The id itself was already validated — `assertRefsInOrg` checks every ref on
  every write, and has since long before this. What is tested here is what that
  check did NOT cover: an archived workspace passed it, and an app user could be
  moved out from under the portal that runs their login.
*/
describe('changing a client’s workspace', () => {
  let service: CustomersService;

  const prisma: Record<string, any> = {
    customer: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    companyLocation: { findFirst: jest.fn() },
    customerActivity: { create: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (tx: Record<string, any>) => unknown) => cb(prisma)),
  };
  const admin = { userId: 'u1', role: 'ADMIN' };
  const client = (over: Record<string, unknown> = {}) => ({
    id: 'c1', status: 'LEAD', isPortalResident: false, ownerId: null, managerIds: [], spaceId: 'sp-1', ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.customer.update.mockResolvedValue({ id: 'c1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CustomersService);
  });

  const move = (to: string | null, existing = client()) => {
    prisma.customer.findFirst.mockResolvedValue(existing);
    return service.update('c1', ORG, { spaceId: to } as never, 'u1', admin as never);
  };

  it('refuses a workspace that is not this organization’s, or is archived', async () => {
    // The check IS the query — another tenant's id, or an archived space,
    // resolves to nothing because both are in the `where`.
    prisma.companyLocation.findFirst.mockResolvedValue(null);
    await expect(move('sp-from-another-org')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(prisma.companyLocation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, isActive: true }) }),
    );
  });

  it('accepts a live workspace of this organization', async () => {
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 'sp-2' });
    await move('sp-2');
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  it('allows clearing it', async () => {
    /*
      Null is what a client created before the workspace was asked for already
      is. Refusing it would make the field impossible to correct back, and there
      is nothing to validate about "nowhere".
    */
    await move(null);
    expect(prisma.companyLocation.findFirst).not.toHaveBeenCalled();
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  it('will not move an app user', async () => {
    // Their workspace is decided by the portal that runs their login; moving
    // them leaves the binding pointing into a space they are no longer in.
    prisma.companyLocation.findFirst.mockResolvedValue({ id: 'sp-2' });
    await expect(move('sp-2', client({ isPortalResident: true }))).rejects.toBeInstanceOf(BadRequestException);
  });
});
