import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * The register of what the organization has issued.
 *
 * Every other list in this service answers "what does THIS PERSON have". This
 * one answers "what did we send, and what state is it in" — so the assertions
 * that matter are about the WHERE clause: which rows each tab claims to be
 * about, and that the organization scope is never the thing left off.
 *
 * Storage is null on purpose, as elsewhere in this suite: none of this should
 * come near S3, and a register that did would be minting links it has no
 * business minting.
 */
describe('DocumentsService — the issued register', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
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

  const whereOf = () => prisma.document.findMany.mock.calls[0][0].where;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.count.mockResolvedValue(0);
    prisma.document.groupBy.mockResolvedValue([]);
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
      service.listIssued({ actor: actor({ canViewMemberDocuments: false }) }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('does NOT require permission to open files — seeing state is not reading', async () => {
    await service.listIssued({ actor: actor({ canOpenMemberDocuments: false }) });
    expect(prisma.document.findMany).toHaveBeenCalled();
  });

  it('scopes every query to the caller’s organization', async () => {
    await service.listIssued({ actor: actor(), tab: 'all' });
    expect(whereOf()).toMatchObject({ organizationId: 'org1' });
  });

  it('never counts drafts as sent — a draft reached nobody', async () => {
    await service.listIssued({ actor: actor(), tab: 'all' });
    expect(whereOf().status).toEqual({ not: 'DRAFT' });
  });

  it('"awaiting" is the rows still blocking somebody', async () => {
    await service.listIssued({ actor: actor(), tab: 'awaiting' });
    expect(whereOf()).toMatchObject({ status: 'AWAITING_SIGNATURE' });
  });

  it('"unopened" spans delivered AND awaiting — the state nothing surfaced before', async () => {
    await service.listIssued({ actor: actor(), tab: 'unopened' });
    expect(whereOf()).toMatchObject({
      firstOpenedAt: null,
      status: { in: ['ISSUED', 'AWAITING_SIGNATURE'] },
    });
  });

  it('"signed" is the finished ones', async () => {
    await service.listIssued({ actor: actor(), tab: 'signed' });
    expect(whereOf()).toMatchObject({ status: 'SIGNED' });
  });

  it('defaults to what needs attention, not to everything', async () => {
    await service.listIssued({ actor: actor() });
    expect(whereOf()).toMatchObject({ status: 'AWAITING_SIGNATURE' });
  });

  it('returns no storage key and no url — a link is minted only by an open', async () => {
    await service.listIssued({ actor: actor() });
    const select = prisma.document.findMany.mock.calls[0][0].select;
    expect(select.storageKey).toBeUndefined();
    expect(select.url).toBeUndefined();
  });

  it('bounds the page size however large a caller asks for', async () => {
    await service.listIssued({ actor: actor(), limit: 100000 });
    expect(prisma.document.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(100);
  });

  it('counts the tabs without one query per tab', async () => {
    await service.listIssued({ actor: actor() });
    // One grouped query covers awaiting/signed/all; "unopened" needs its own
    // because it is not a status. Two, not four.
    expect(prisma.document.groupBy).toHaveBeenCalledTimes(1);
  });

  it('narrows to one member when asked, still inside the organization', async () => {
    await service.listIssued({ actor: actor(), tab: 'all', userId: 'u9' });
    expect(whereOf()).toMatchObject({ organizationId: 'org1', userId: 'u9' });
  });
});
