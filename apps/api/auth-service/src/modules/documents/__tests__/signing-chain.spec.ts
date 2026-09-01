import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * A document that more than one person signs.
 *
 * The assertions here are about TURN and COMPLETION, because those are the two
 * things that decide whether a chain is trustworthy. Signing out of order would
 * make the order printed on the page a decoration, and finishing early would
 * take a document off everybody's list while two people still had to sign it.
 *
 * Storage is null throughout: every one of these is reached before anything is
 * rendered or sealed, and a test that needed a working store to prove a refusal
 * would be testing the wrong layer.
 */
describe('DocumentsService — the signing chain', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: { findFirst: jest.fn(), update: jest.fn() },
    documentSignature: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    documentEvent: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    documentSigner: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    documentType: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    customer: { findMany: jest.fn().mockResolvedValue([]) },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const actor = (userId: string, over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId,
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
    ...over,
  });

  /** worker signs first, then their responsible, then the client. */
  const chain = (signedUpTo = 0) => [
    { order: 1, role: 'MEMBER', status: signedUpTo >= 1 ? 'SIGNED' : 'PENDING', userId: 'worker', customerId: null, signedAt: null },
    { order: 2, role: 'RESPONSIBLE', status: signedUpTo >= 2 ? 'SIGNED' : 'PENDING', userId: 'anna', customerId: null, signedAt: null },
    { order: 3, role: 'CUSTOMER', status: signedUpTo >= 3 ? 'SIGNED' : 'PENDING', userId: null, customerId: 'binderholz', signedAt: null },
  ];

  const sign = (who: string) =>
    service.signDocument({
      actor: actor(who),
      documentId: 'doc1',
      signatureImage: 'data:image/png;base64,AAAA',
      idempotencyKey: 'idem-key-12345678',
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.documentSignature.findUnique.mockResolvedValue(null);
    prisma.documentSigner.findMany.mockResolvedValue([]);
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

  describe('whose turn it is', () => {
    it('lets the person being waited on sign, even though the document is not theirs', async () => {
      // The whole point of Phase 2: a manager signs a document issued to
      // somebody else. Before this, the query was scoped to the caller and
      // their own id was the only one that could ever be found.
      prisma.documentSigner.findMany.mockResolvedValue(chain(1));
      prisma.document.findFirst.mockResolvedValue(null); // stops after authorization

      await expect(sign('anna')).rejects.not.toBeInstanceOf(ForbiddenException);
    });

    it('refuses somebody whose turn has not come', async () => {
      prisma.documentSigner.findMany.mockResolvedValue(chain(0));
      await expect(sign('anna')).rejects.toBeInstanceOf(ForbiddenException);
      // Refused before the document is even read.
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
    });

    it('refuses somebody who has already signed', async () => {
      prisma.documentSigner.findMany.mockResolvedValue(chain(1));
      await expect(sign('worker')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a stranger to the chain', async () => {
      prisma.documentSigner.findMany.mockResolvedValue(chain(1));
      await expect(sign('someone-else')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses when every step is done', async () => {
      prisma.documentSigner.findMany.mockResolvedValue(chain(3));
      await expect(sign('worker')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('a document with no route', () => {
    it('still scopes the lookup to the caller, exactly as before', async () => {
      // Every document issued before Phase 2 is this shape, and none of them
      // may become signable by a colleague.
      prisma.documentSigner.findMany.mockResolvedValue([]);
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(sign('u-monika')).rejects.toBeTruthy();
      expect(prisma.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u-monika', organizationId: 'org1' }),
        }),
      );
    });
  });

  describe('resolving a route to people', () => {
    const issuer = actor('admin', { canIssueDocuments: true });

    it('refuses a caller who cannot issue documents', async () => {
      await expect(
        service.routeCandidates({ actor: actor('nobody'), memberId: 'worker', typeId: 'ty1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns no steps for a type with no route — nothing to choose', async () => {
      prisma.documentType.findFirst.mockResolvedValue({ id: 'ty1', label: 'Payslip', signerRoute: null });
      prisma.user.findFirst.mockResolvedValue({ id: 'worker', firstName: 'Mike', lastName: 'Weber' });

      const r = await service.routeCandidates({ actor: issuer, memberId: 'worker', typeId: 'ty1' });
      expect(r.steps).toEqual([]);
    });

    it('resolves MEMBER to the person the document is about', async () => {
      prisma.documentType.findFirst.mockResolvedValue({
        id: 'ty1', label: 'Time sheet', signerRoute: [{ role: 'MEMBER' }],
      });
      prisma.user.findFirst.mockResolvedValue({ id: 'worker', firstName: 'Mike', lastName: 'Weber' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'worker', firstName: 'Mike', lastName: 'Weber', email: 'mike@example.com',
      });

      const r = await service.routeCandidates({ actor: issuer, memberId: 'worker', typeId: 'ty1' });
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0].candidates).toEqual([
        { kind: 'USER', id: 'worker', name: 'Mike Weber', email: 'mike@example.com' },
      ]);
    });

    it('never offers a member as their own approver', async () => {
      // Signing your own hours off is the one arrangement this must not allow,
      // and routing config could otherwise produce it by accident.
      prisma.documentType.findFirst.mockResolvedValue({
        id: 'ty1', label: 'Time sheet', signerRoute: [{ role: 'RESPONSIBLE' }],
      });
      prisma.user.findFirst.mockResolvedValue({ id: 'worker', firstName: 'Mike', lastName: 'Weber' });
      // Routing that (wrongly) includes the subject themselves.
      prisma.spaceAssignment.findMany.mockResolvedValue([
        {
          spaceId: 's1', organizationId: 'org1',
          notifyRoleIds: [], notifyUserIds: [], contactRoleIds: [], contactUserIds: [],
          approveRoleIds: [], approveUserIds: ['worker', 'anna'],
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'anna', firstName: 'Anna', lastName: 'Müller', email: 'anna@example.com' },
      ]);

      const r = await service.routeCandidates({ actor: issuer, memberId: 'worker', typeId: 'ty1' });
      expect(r.steps[0].candidates.map((c) => c.id)).toEqual(['anna']);
    });
  });
});
