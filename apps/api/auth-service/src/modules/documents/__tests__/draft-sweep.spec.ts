import { Test } from '@nestjs/testing';
import { DocumentsService } from '../documents.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OBJECT_STORE } from '../object-store.provider';
import { MrzOcrService } from '../mrz-ocr.service';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * Staged batches nobody released, and the file they share.
 *
 * Two behaviours are pinned here and the second is the dangerous one.
 *
 * A batch is uploaded first and published second, so thirty payslips appear in
 * one moment. Close the tab in between and the drafts sit in the database and
 * in storage, invisible to the member and unreachable from any screen.
 *
 * ⚠️ And storage keys are CONTENT-ADDRESSED — the same policy issued to thirty
 * people is ONE object. So removing the file because one row went away would
 * take it out from under the other twenty-nine, who would keep listing normally
 * and fail only when somebody tried to open one.
 */
describe('abandoned staged drafts', () => {
  let service: DocumentsService;
  let prisma: any;
  let store: { delete: jest.Mock };

  const build = async () => {
    store = { delete: jest.fn().mockResolvedValue(true) };
    prisma = {
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      // The cron lease. Claimed, so the job body runs.
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: true }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const mod = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OBJECT_STORE, useValue: store },
        { provide: MrzOcrService, useValue: {} },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = mod.get(DocumentsService);
  };

  beforeEach(build);

  it('removes drafts older than the week it waits', async () => {
    prisma.document.findMany.mockResolvedValue([
      { id: 'd1', storageKey: 'org/aaa.pdf' },
      { id: 'd2', storageKey: 'org/bbb.pdf' },
    ]);

    await service.purgeAbandonedDrafts();

    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('DRAFT');
    // Seven days back, give or take the moment the test ran.
    const days = (Date.now() - where.createdAt.lt.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d1', 'd2'] } } });
  });

  it('does nothing at all when there are none — no delete, no log', async () => {
    await service.purgeAbandonedDrafts();
    expect(prisma.document.deleteMany).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('frees the file once the last row referencing it has gone', async () => {
    prisma.document.findMany.mockResolvedValue([{ id: 'd1', storageKey: 'org/aaa.pdf' }]);
    prisma.document.count.mockResolvedValue(0);

    await service.purgeAbandonedDrafts();

    expect(store.delete).toHaveBeenCalledWith('org/aaa.pdf');
  });

  /*
    THE assertion. One policy issued to thirty people is one object; deleting it
    with twenty-nine rows still pointing at it breaks every one of them, and
    breaks them silently — the list still renders, and only opening fails.
  */
  it('leaves a file alone while any other document still is that file', async () => {
    prisma.document.findMany.mockResolvedValue([{ id: 'd1', storageKey: 'org/shared.pdf' }]);
    prisma.document.count.mockResolvedValue(29);

    await service.purgeAbandonedDrafts();

    expect(prisma.document.deleteMany).toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('asks about a shared key once, not once per row', async () => {
    prisma.document.findMany.mockResolvedValue([
      { id: 'd1', storageKey: 'org/same.pdf' },
      { id: 'd2', storageKey: 'org/same.pdf' },
      { id: 'd3', storageKey: 'org/other.pdf' },
    ]);
    await service.purgeAbandonedDrafts();
    expect(prisma.document.count).toHaveBeenCalledTimes(2);
  });

  it('survives storage being unreachable — the rows still go', async () => {
    prisma.document.findMany.mockResolvedValue([{ id: 'd1', storageKey: 'org/aaa.pdf' }]);
    store.delete.mockRejectedValue(new Error('S3 down'));
    await expect(service.purgeAbandonedDrafts()).resolves.toBeUndefined();
    expect(prisma.document.deleteMany).toHaveBeenCalled();
  });

  it('does not run when another replica holds the lease', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    await service.purgeAbandonedDrafts();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('bounds one night’s work rather than deleting a million rows at once', async () => {
    await service.purgeAbandonedDrafts();
    expect(prisma.document.findMany.mock.calls[0][0].take).toBe(500);
  });
});

describe('discarding a draft by hand', () => {
  let service: DocumentsService;
  let prisma: any;
  let store: { delete: jest.Mock };

  const ACTOR = { userId: 'admin', organizationId: 'org1', canIssueDocuments: true, role: 'ADMIN' };

  beforeEach(async () => {
    store = { delete: jest.fn().mockResolvedValue(true) };
    prisma = {
      document: {
        findFirst: jest.fn().mockResolvedValue({ id: 'd1', storageKey: 'org/aaa.pdf' }),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const mod = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OBJECT_STORE, useValue: store },
        { provide: MrzOcrService, useValue: {} },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = mod.get(DocumentsService);
  });

  /*
    It used to delete the row and leave the file. Every discarded draft was a
    permanent object in storage that nothing would ever reach again.
  */
  it('frees the file too, which it did not before', async () => {
    await service.discardDraft({ actor: ACTOR as never, documentId: 'd1' });
    expect(prisma.document.delete).toHaveBeenCalled();
    expect(store.delete).toHaveBeenCalledWith('org/aaa.pdf');
  });

  it('keeps the file when another document is the same bytes', async () => {
    prisma.document.count.mockResolvedValue(1);
    await service.discardDraft({ actor: ACTOR as never, documentId: 'd1' });
    expect(store.delete).not.toHaveBeenCalled();
  });
});
