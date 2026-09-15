import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CustomersService } from '../customers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/*
  "Language for emails" on a client record.

  It is client INFO, like the phone number: the same editInfo gate, no permission
  of its own. A value off the list is refused — not dropped — because a record
  that saves while silently ignoring a field says "saved" about something that
  was not.
*/

const ORG = 'org-1';

describe('client record language', () => {
  let service: CustomersService;

  const prisma: Record<string, any> = {
    customer: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    customerActivity: { create: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn() },
  };

  const admin = { userId: 'u1', role: 'ADMIN' };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.customer.create.mockImplementation(async ({ data }: any) => data);
    prisma.customer.update.mockImplementation(async ({ data }: any) => data);
    prisma.customer.findFirst.mockResolvedValue({
      id: 'c1', status: 'LEAD', isPortalResident: false, ownerId: 'u2', managerIds: [], spaceId: null,
    });
    prisma.user.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CustomersService);
  });

  describe('create', () => {
    it('stores a language from the list, lower-cased', async () => {
      await service.create(ORG, { name: 'BILLA AG', locale: 'DE' }, admin);
      expect(prisma.customer.create.mock.calls[0][0].data.locale).toBe('de');
    });

    it('stores nothing when none is chosen — "same as the organization"', async () => {
      await service.create(ORG, { name: 'BILLA AG', locale: '' }, admin);
      await service.create(ORG, { name: 'Siemens AG' }, admin);
      expect(prisma.customer.create.mock.calls[0][0].data.locale).toBeNull();
      expect(prisma.customer.create.mock.calls[1][0].data.locale).toBeNull();
    });

    it('refuses a language that is not on the list, and creates nothing', async () => {
      await expect(service.create(ORG, { name: 'BILLA AG', locale: 'pt' }, admin)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(ORG, { name: 'BILLA AG', locale: 'de-AT' }, admin)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('sets it, clears it, and leaves it alone when the edit does not mention it', async () => {
      await service.update('c1', ORG, { locale: 'it' }, 'u1', admin);
      await service.update('c1', ORG, { locale: null }, 'u1', admin);
      await service.update('c1', ORG, { phone: '+43 1' }, 'u1', admin);

      expect(prisma.customer.update.mock.calls[0][0].data).toEqual({ locale: 'it' });
      expect(prisma.customer.update.mock.calls[1][0].data).toEqual({ locale: null });
      expect('locale' in prisma.customer.update.mock.calls[2][0].data).toBe(false);
    });

    it('refuses a value off the list without writing anything', async () => {
      await expect(service.update('c1', ORG, { locale: 'xx', phone: '+43 1' }, 'u1', admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('is client info: a member who may work a client but not edit its info cannot change it', async () => {
      // A rep who sees their own clients and may work them, but holds no crmEditInfo.
      prisma.user.findFirst.mockResolvedValue({
        role: 'EMPLOYEE',
        memberRole: { permissions: { crmViewOwn: true, crmWork: true } },
      });
      await expect(
        service.update('c1', ORG, { locale: 'de' }, 'u2', { userId: 'u2', role: 'EMPLOYEE' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('returns the language with the record, so the form reads back what it saved', async () => {
      await service.update('c1', ORG, { locale: 'fr' }, 'u1', admin);
      expect(prisma.customer.update.mock.calls[0][0].select.locale).toBe(true);
    });
  });
});
