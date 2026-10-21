import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { DOCUMENT_SERVICES } from '../document-services';
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
        ...DOCUMENT_SERVICES,
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

  /*
    Same door as sign / consent / acknowledge. A POOL step carries no userId
    until somebody signs, so comparing `current.userId` locked every pool
    member out; and the read was type-scoped with no routed-signer exemption.
  */
  it('lets anybody in a POOL step send it back', async () => {
    prisma.documentSigner.findMany.mockResolvedValue([
      { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'worker', customerId: null, signedAt: new Date() },
      { order: 2, role: 'RESPONSIBLE', status: 'PENDING', userId: null, eligibleUserIds: ['anna', 'ben'], customerId: null, signedAt: null },
    ]);
    await expect(send('ben')).resolves.toEqual({ documentId: 'doc1', backToStep: 1 });
    await expect(send('carl')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a routed signer sends back a document of a type they could not otherwise see', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc1', title: 'Time sheet', userId: 'worker', status: 'AWAITING_SIGNATURE',
      hiddenFromMember: false, rolesOverridden: false, visibleToRoleIds: [],
      type: { visibleToRoleIds: ['role-hr'] },
    });
    await expect(send('anna')).resolves.toEqual({ documentId: 'doc1', backToStep: 1 });
    // The lookup is no longer narrowed by the type — the step authorises it.
    expect(JSON.stringify(prisma.document.findFirst.mock.calls[0][0].where)).not.toContain('role-hr');
  });
});

