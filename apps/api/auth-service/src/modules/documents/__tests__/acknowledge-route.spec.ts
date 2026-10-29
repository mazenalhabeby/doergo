import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SERVICE_NAMES, PrismaService } from '@hbcfield/shared';
import { MrzOcrService } from '../reading/mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { DOCUMENT_SERVICES } from '../document-services';
import { OBJECT_STORE } from '../core/object-store.provider';

/*
  "I have read this" on a document with a signing route.

  It set the whole document ISSUED on the first acknowledgement and left every
  step PENDING — so a safety policy routed member → leader finished the moment
  the member tapped it, and the leader was never asked. Now it is the caller's
  step, like a signature: only that step moves, and the document finishes when
  every step is done.
*/
describe('acknowledging a routed document advances only the caller’s step', () => {
  let service: DocumentsService;
  const prisma: Record<string, any> = {
    document: { findFirst: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })), findUnique: jest.fn() },
    documentEvent: { create: jest.fn() },
    documentSigner: {
      findMany: jest.fn(),
      findFirst: jest.fn(async () => null),
      update: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const actor = (userId: string): DocumentActor => ({
    userId,
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
  });
  const route = (memberDone: boolean) => [
    { order: 1, role: 'MEMBER', status: memberDone ? 'SIGNED' : 'PENDING', userId: 'mike', eligibleUserIds: ['mike'] },
    { order: 2, role: 'RESPONSIBLE', status: 'PENDING', userId: null, eligibleUserIds: ['anna'] },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc1',
      organizationId: 'org1',
      userId: 'mike',
      title: 'Safety policy',
      status: 'AWAITING_SIGNATURE',
      type: { label: 'Safety policy', signatureMode: 'ACKNOWLEDGE' },
    });
    const module = await Test.createTestingModule({
      providers: [
        ...DOCUMENT_SERVICES,
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('the member acknowledging moves step 1 only; the document waits for the leader', async () => {
    prisma.documentSigner.findMany.mockResolvedValue(route(false));
    await service.acknowledgeDocument({ actor: actor('mike'), documentId: 'doc1' });

    expect(prisma.documentSigner.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentId: 'doc1', order: 1, status: 'PENDING' } }),
    );
    expect(prisma.document.updateMany.mock.calls[0][0].data).toEqual({});
  });

  it('the last step finishes it', async () => {
    prisma.documentSigner.findMany.mockResolvedValue(route(true));
    await service.acknowledgeDocument({ actor: actor('anna'), documentId: 'doc1' });

    expect(prisma.documentSigner.updateMany.mock.calls[0][0].where.order).toBe(2);
    expect(prisma.document.updateMany.mock.calls[0][0].data).toEqual({ status: 'ISSUED' });
  });

  it('two taps at once: the second is 409', async () => {
    prisma.documentSigner.findMany.mockResolvedValue(route(true));
    prisma.documentSigner.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.acknowledgeDocument({ actor: actor('anna'), documentId: 'doc1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
