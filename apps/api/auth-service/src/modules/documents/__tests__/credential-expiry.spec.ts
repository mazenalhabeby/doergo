import { Test } from '@nestjs/testing';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialExpiryService } from '../credential-expiry.service';

/**
 * The nightly sweep.
 *
 * Two failures it is written to avoid, both quiet: expiring a certificate a day
 * early, and sending the same warning three times because three containers all
 * ran the same schedule.
 */
describe('CredentialExpiryService', () => {
  let service: CredentialExpiryService;

  const prisma: Record<string, any> = {
    document: { updateMany: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
  const notifications = { emit: jest.fn() };

  const NOW = new Date('2026-08-29T02:00:00Z');

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    prisma.document.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u-admin' }, { id: 'u-dispatcher' }]);

    const module = await Test.createTestingModule({
      providers: [
        CredentialExpiryService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notifications },
      ],
    }).compile();
    service = module.get(CredentialExpiryService);
  });

  describe('markExpired', () => {
    it('compares against the START of today, not the current moment', async () => {
      await service.markExpired(NOW);
      const where = prisma.document.updateMany.mock.calls[0][0].where;
      // A certificate valid "until 29 August" is valid all of 29 August. A
      // naive `< now()` would expire it at 00:01 on a day it is still good for.
      expect(where.expiresOn.lt.toISOString()).toBe('2026-08-29T00:00:00.000Z');
    });

    it('touches only credentials that are currently live', async () => {
      await service.markExpired(NOW);
      const where = prisma.document.updateMany.mock.calls[0][0].where;
      expect(where.type).toEqual({ isCredential: true });
      expect(where.status).toEqual({ in: ['ISSUED', 'SIGNED'] });
      // Never re-expires something already EXPIRED, and never touches a payslip.
    });

    it('sets the status rather than deleting anything', async () => {
      await service.markExpired(NOW);
      expect(prisma.document.updateMany.mock.calls[0][0].data).toEqual({ status: 'EXPIRED' });
    });
  });

  describe('sendReminders', () => {
    const credential = (daysAhead: number, id = 'd1') => ({
      id,
      title: 'Gas Safe certificate',
      expiresOn: new Date(Date.UTC(2026, 7, 29 + daysAhead)),
      organizationId: 'org1',
      user: { id: 'u-mike', firstName: 'Mike', lastName: 'Weber', email: 'mike@example.com' },
      type: { label: 'Gas Safe' },
    });

    it('reads only the window, not every credential in the system', async () => {
      await service.sendReminders(NOW);
      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where.expiresOn.gte).toEqual(NOW);
      // Bounded by the widest threshold plus a day.
      const days = (where.expiresOn.lte.getTime() - NOW.getTime()) / 86_400_000;
      expect(days).toBeGreaterThan(59);
      expect(days).toBeLessThan(62);
    });

    it.each([60, 30, 7])('sends on the %s-day threshold', async (d) => {
      prisma.document.findMany.mockResolvedValue([credential(d)]);
      expect(await service.sendReminders(NOW)).toBe(1);
      expect(notifications.emit).toHaveBeenCalledWith(
        'credential_expiring',
        expect.objectContaining({ daysLeft: d, credential: 'Gas Safe' }),
      );
    });

    it.each([59, 45, 31, 29, 8, 6, 1])('stays silent on day %s', async (d) => {
      // Only ON a threshold. Otherwise a credential sitting at "30 days left"
      // for three weeks would produce twenty-one identical messages.
      prisma.document.findMany.mockResolvedValue([credential(d)]);
      expect(await service.sendReminders(NOW)).toBe(0);
      expect(notifications.emit).not.toHaveBeenCalled();
    });

    it('carries who, what and when — enough to act on without opening the app', async () => {
      prisma.document.findMany.mockResolvedValue([credential(30)]);
      await service.sendReminders(NOW);
      expect(notifications.emit).toHaveBeenCalledWith(
        'credential_expiring',
        expect.objectContaining({
          userName: 'Mike Weber',
          credential: 'Gas Safe',
          daysLeft: 30,
          expiresOn: '2026-09-28',
          standing: 'EXPIRING',
          organizationId: 'org1',
        }),
      );
    });

    it('tells whoever schedules the work, not only the member', async () => {
      prisma.document.findMany.mockResolvedValue([credential(30)]);
      await service.sendReminders(NOW);
      expect(notifications.emit).toHaveBeenCalledWith(
        'credential_expiring',
        expect.objectContaining({ recipientIds: ['u-admin', 'u-dispatcher'] }),
      );
    });

    it('resolves those recipients once per organization, not once per credential', async () => {
      prisma.document.findMany.mockResolvedValue([
        credential(30, 'a'), credential(30, 'b'), credential(7, 'c'),
      ]);
      await service.sendReminders(NOW);
      // Three reminders, one lookup. A fifty-credential sweep must not ask
      // fifty times who the dispatchers are.
      expect(notifications.emit).toHaveBeenCalledTimes(3);
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });

    it('keeps sweeping when one notification fails', async () => {
      prisma.document.findMany.mockResolvedValue([credential(30, 'a'), credential(30, 'b')]);
      notifications.emit.mockImplementationOnce(() => { throw new Error('down'); });
      // One unreachable recipient must not stop the rest of the run.
      expect(await service.sendReminders(NOW)).toBe(1);
      expect(notifications.emit).toHaveBeenCalledTimes(2);
    });
  });

  describe('listCompliance', () => {
    it('says whether a lapse actually stops somebody working', async () => {
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'c1', title: 'Electrical E-2', expiresOn: new Date('2026-08-03'), status: 'EXPIRED',
          user: { id: 'u1', firstName: 'Monika', lastName: 'Holub' },
          type: { id: 't1', label: 'Electrical E-2', requiredForWorkflowIds: ['wf-electrical'] },
        },
        {
          id: 'c2', title: 'First aid', expiresOn: new Date('2026-08-03'), status: 'EXPIRED',
          user: { id: 'u2', firstName: 'Mike', lastName: 'Weber' },
          type: { id: 't2', label: 'First aid', requiredForWorkflowIds: [] },
        },
      ]);
      const rows = await service.listCompliance({ organizationId: 'org1' });

      // Both expired; only one has removed anybody from the pool. That
      // distinction is what turns a list into something to act on.
      expect(rows[0]).toMatchObject({ standing: 'EXPIRED', blocksDispatch: true });
      expect(rows[1]).toMatchObject({ standing: 'EXPIRED', blocksDispatch: false });
    });

    it('is scoped to the organization and to credential types only', async () => {
      await service.listCompliance({ organizationId: 'org1' });
      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org1');
      expect(where.type).toEqual({ isCredential: true, isActive: true });
    });

    it('returns dates and validity — never the document itself', async () => {
      await service.listCompliance({ organizationId: 'org1' });
      const select = prisma.document.findMany.mock.calls[0][0].select;
      // A dispatcher needs to know a certificate lapsed, not to read it.
      expect(select.storageKey).toBeUndefined();
      expect(select.sha256).toBeUndefined();
    });

    it('orders by what expires soonest', async () => {
      await service.listCompliance({ organizationId: 'org1' });
      expect(prisma.document.findMany.mock.calls[0][0].orderBy).toEqual([{ expiresOn: 'asc' }]);
    });
  });

  describe('the schedule takes a lease', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'credential-expiry.service.ts'),
      'utf8',
    );

    it('wraps the nightly run in runWithCronLock', () => {
      // NestJS starts a @Cron in EVERY replica. Without the lease a
      // three-container deployment sends every reminder three times, and a
      // person who gets three copies learns to ignore all of them.
      expect(src).toContain('runWithCronLock(');
      expect(src).toContain("name: 'documents:credentialExpiry'");
    });

    it('keeps the work callable outside the schedule', () => {
      // The cron decides WHETHER this replica runs; the methods are plain and
      // testable, which is what these tests rely on.
      expect(typeof service.markExpired).toBe('function');
      expect(typeof service.sendReminders).toBe('function');
    });
  });
});
