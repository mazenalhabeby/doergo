import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Returning a document to an earlier signer.
 *
 * The alternative is revoke-and-reissue, which throws the chain away: the
 * worker signs a NEW document and the record of the first attempt disappears.
 * Sending back keeps one document and one history — which is the whole reason
 * a chain is worth having.
 */
describe('DocumentsService — sendBack', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: { findFirst: jest.fn() },
    documentSigner: { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    documentEvent: { create: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
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

  /** Worker signed, responsible is holding it, customer has not been asked. */
  const chain = [
    { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'worker', customerId: null, signedAt: new Date() },
    { order: 2, role: 'RESPONSIBLE', status: 'PENDING', userId: 'anna', customerId: null, signedAt: null },
    { order: 3, role: 'CUSTOMER', status: 'PENDING', userId: null, customerId: 'binderholz', signedAt: null },
  ];

  const send = (who: string, reason = 'The Tuesday hours are wrong') =>
    service.sendBack({ actor: actor(who), documentId: 'doc1', reason });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.document.findFirst.mockResolvedValue({ id: 'doc1', title: 'Time sheet' });
    prisma.documentSigner.findMany.mockResolvedValue(chain);
    prisma.user.findUnique.mockResolvedValue(null);
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

  it('sends it back to the nearest earlier signer', async () => {
    const r = await send('anna');
    expect(r).toEqual({ documentId: 'doc1', backToStep: 1 });
  });

  it('reopens that step AND everything after it', async () => {
    // Leaving the in-between steps signed would let the chain skip them on the
    // way back up, and the order is the point.
    await send('anna');
    expect(prisma.documentSigner.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ order: { gte: 1 }, status: 'SIGNED' }),
        data: { status: 'PENDING', signedAt: null },
      }),
    );
  });

  it('records why, on the trail', async () => {
    await send('anna', 'Tuesday is double-counted');
    expect(prisma.documentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SENT_BACK',
          meta: { reason: 'Tuesday is double-counted', toStep: 1 },
        }),
      }),
    );
  });

  it('refuses anybody who is not the one holding it', async () => {
    // Including the person it would go back to — reaching into a document that
    // is in somebody else's hands is exactly what this must not allow.
    await expect(send('worker')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(send('someone-else')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('insists on a reason', async () => {
    for (const bad of ['', '  ', 'no']) {
      await expect(send('anna', bad)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.documentSigner.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when there is no earlier signer to go back to', async () => {
    prisma.documentSigner.findMany.mockResolvedValue([
      { order: 1, role: 'MEMBER', status: 'PENDING', userId: 'worker', customerId: null, signedAt: null },
    ]);
    await expect(send('worker')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not send back to a SKIPPED step — nobody was ever asked', async () => {
    prisma.documentSigner.findMany.mockResolvedValue([
      { order: 1, role: 'CUSTOMER', status: 'SKIPPED', userId: null, customerId: null, signedAt: null },
      { order: 2, role: 'RESPONSIBLE', status: 'PENDING', userId: 'anna', customerId: null, signedAt: null },
    ]);
    await expect(send('anna')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a document that is not waiting for anybody', async () => {
    prisma.documentSigner.findMany.mockResolvedValue([
      { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'worker', customerId: null, signedAt: new Date() },
    ]);
    await expect(send('worker')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not find a document belonging to another organization', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    await expect(send('anna')).rejects.toBeInstanceOf(NotFoundException);
  });
});
