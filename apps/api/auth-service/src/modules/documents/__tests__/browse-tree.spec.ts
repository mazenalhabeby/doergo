import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * The filing cabinet.
 *
 * The thing worth protecting here is that the tree is walked ONE LEVEL AT A
 * TIME. Assembling it whole would mean reading every document in the
 * organization to draw a screen of eight folders, and it would degrade every
 * month the product is used — so these assert on which single grouping runs,
 * and on the path narrowing the query rather than being filtered afterwards.
 */
describe('DocumentsService — browse', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    documentType: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId: 'me',
    organizationId: 'org1',
    canViewMemberDocuments: true,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
    ...over,
  });

  const groupArgs = () => prisma.document.groupBy.mock.calls[0][0];

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.document.groupBy.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.documentType.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('refuses a caller who may not see other members’ documents', async () => {
    await expect(
      service.browse({ actor: actor({ canViewMemberDocuments: false }) }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.document.groupBy).not.toHaveBeenCalled();
  });

  it('opens on document types when grouping by type', async () => {
    const r = await service.browse({ actor: actor(), groupBy: 'type' });
    expect(r.level).toBe('type');
    expect(groupArgs().by).toEqual(['typeId']);
  });

  it('opens on people when grouping by member — the personnel-file view', async () => {
    const r = await service.browse({ actor: actor(), groupBy: 'member' });
    expect(r.level).toBe('member');
    expect(groupArgs().by).toEqual(['userId']);
  });

  it('walks type → year once a type is chosen', async () => {
    const r = await service.browse({ actor: actor(), groupBy: 'type', typeId: 'ty1' });
    expect(r.level).toBe('year');
    expect(groupArgs().where).toMatchObject({ typeId: 'ty1' });
  });

  it('walks type → year → member, then reaches the documents', async () => {
    const r = await service.browse({
      actor: actor(), groupBy: 'type', typeId: 'ty1', year: 2026, userId: 'u1',
    });
    expect(r.level).toBe('documents');
    expect(prisma.document.groupBy).not.toHaveBeenCalled();
    expect(prisma.document.findMany).toHaveBeenCalled();
  });

  it('never assembles the whole tree — one grouping per request', async () => {
    await service.browse({ actor: actor(), groupBy: 'type' });
    expect(prisma.document.groupBy).toHaveBeenCalledTimes(1);
  });

  it('scopes every level to the organization', async () => {
    await service.browse({ actor: actor(), groupBy: 'year' });
    expect(groupArgs().where).toMatchObject({ organizationId: 'org1' });
  });

  it('excludes drafts from the cabinet — they reached nobody', async () => {
    await service.browse({ actor: actor() });
    expect(groupArgs().where.status).toEqual({ not: 'DRAFT' });
  });

  it('gives undated documents a folder instead of dropping them', async () => {
    prisma.document.groupBy.mockResolvedValue([
      { periodYear: 2026, _count: 3 },
      { periodYear: null, _count: 2 },
    ]);
    const r = await service.browse({ actor: actor(), groupBy: 'type', typeId: 'ty1' });
    const undated = r.folders.find((f: any) => f.undated);
    expect(undated).toBeDefined();
    expect(undated!.count).toBe(2);
  });

  it('sorts years newest first and leaves undated last', async () => {
    prisma.document.groupBy.mockResolvedValue([
      { periodYear: null, _count: 1 },
      { periodYear: 2024, _count: 1 },
      { periodYear: 2026, _count: 1 },
    ]);
    const r = await service.browse({ actor: actor(), groupBy: 'type', typeId: 'ty1' });
    expect(r.folders.map((f: any) => f.key)).toEqual(['2026', '2024', 'undated']);
  });

  it('entering the undated folder filters on a null period, not on no filter', async () => {
    await service.browse({ actor: actor(), groupBy: 'type', typeId: 'ty1', undated: true });
    expect(groupArgs().where).toMatchObject({ periodYear: null });
  });

  it('resolves names in one lookup, not one per folder', async () => {
    prisma.document.groupBy.mockResolvedValue([
      { typeId: 'a', _count: 1 }, { typeId: 'b', _count: 1 }, { typeId: 'c', _count: 1 },
    ]);
    await service.browse({ actor: actor(), groupBy: 'type' });
    expect(prisma.documentType.findMany).toHaveBeenCalledTimes(1);
  });
});
