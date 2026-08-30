import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Reviewing what a member supplied.
 *
 * This is the act that turns a claim into a record. Approving a certificate
 * puts somebody back into the assignable pool; refusing keeps them out of it.
 * So the assertions here are about WHAT MOVES and what must not:
 *
 *   only PENDING_VERIFICATION can be reviewed — re-approving an issued document
 *   would rewrite `verifiedAt` on something nobody re-examined, and "rejecting"
 *   a payslip is not a review, it is a way to make a record disappear
 *
 *   the status is what the dispatch gate reads, so approving must set it and
 *   `verifiedAt` is an audit fact rather than a second condition
 *
 *   a refusal carries a reason, because the member reads it
 */
describe('DocumentsService — reviewing a supplied document', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    documentEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const notifications = { emit: jest.fn() };

  const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId: 'reviewer',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: true,
    canManageDocumentTemplates: false,
    ...over,
  });

  const PENDING = {
    id: 'doc1',
    status: 'PENDING_VERIFICATION',
    user: { id: 'member1', firstName: 'Lisa', lastName: 'Adler', email: 'lisa@example.com' },
    type: { label: 'Driving licence', signatureMode: 'NONE' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        // Stubbed: every test here is about who may file what, not about
        // reading pixels — and a real WASM engine per suite would add minutes.
        { provide: MrzOcrService, useValue: { read: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notifications },
        { provide: OBJECT_STORE, useValue: {} },
      ],
    }).compile();
    service = module.get(DocumentsService);

    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        document: { update: prisma.document.update },
        documentEvent: { create: prisma.documentEvent.create },
      }),
    );
    prisma.document.update.mockImplementation(({ data }: any) => ({ id: 'doc1', ...data }));
  });

  // ── The queue ─────────────────────────────────────────────────────────────

  describe('listAwaitingVerification', () => {
    it('refuses somebody who cannot issue documents', async () => {
      await expect(
        service.listAwaitingVerification({ actor: actor({ canIssueDocuments: false }) }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('asks only for this organization’s pending documents', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await service.listAwaitingVerification({ actor: actor() });
      expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({
        organizationId: 'org1',
        status: 'PENDING_VERIFICATION',
      });
    });

    it('returns the oldest first — the person waiting longest is the most blocked', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await service.listAwaitingVerification({ actor: actor() });
      expect(prisma.document.findMany.mock.calls[0][0].orderBy).toEqual({ issuedAt: 'asc' });
    });

    it('says whether anybody is actually blocked by each one', async () => {
      /*
        The difference between a filing task and a person who cannot be sent to
        work. A queue that looked the same either way would be worked through in
        whatever order felt tidy.
      */
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'd1', title: 'Licence', issuedAt: new Date(), expiresOn: new Date('2030-01-01'),
          sizeBytes: 100, mimeType: 'image/jpeg',
          user: { id: 'u1', firstName: 'Lisa', lastName: 'Adler' },
          type: { id: 't1', label: 'Driving licence', isCredential: true, requiredForWorkflowIds: ['w1'] },
        },
        {
          id: 'd2', title: 'ID', issuedAt: new Date(), expiresOn: null,
          sizeBytes: 100, mimeType: 'image/jpeg',
          user: { id: 'u2', firstName: 'Mike', lastName: 'Weber' },
          type: { id: 't2', label: 'ID document', isCredential: false, requiredForWorkflowIds: [] },
        },
      ]);
      const rows = await service.listAwaitingVerification({ actor: actor() });
      expect(rows.map((r) => r.blocksWork)).toEqual([true, false]);
    });

    it('flags one that has already expired, so it is not waved through', async () => {
      // Approving a lapsed certificate puts a tick on something the dispatch
      // gate will still refuse.
      prisma.document.findMany.mockResolvedValue([{
        id: 'd1', title: 'Licence', issuedAt: new Date(), expiresOn: new Date('2020-01-01'),
        sizeBytes: 100, mimeType: 'image/jpeg',
        user: { id: 'u1', firstName: 'Lisa', lastName: 'Adler' },
        type: { id: 't1', label: 'Driving licence', isCredential: true, requiredForWorkflowIds: [] },
      }]);
      const [row] = await service.listAwaitingVerification({ actor: actor() });
      expect(row!.standing).toBe('EXPIRED');
    });

    it('mints no URLs — opening a document is a separate, recorded act', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await service.listAwaitingVerification({ actor: actor() });
      const select = prisma.document.findMany.mock.calls[0][0].select;
      expect(select.storageKey).toBeUndefined();
    });
  });

  // ── Accepting ─────────────────────────────────────────────────────────────

  describe('verifyDocument', () => {
    it('refuses somebody who cannot issue documents', async () => {
      await expect(
        service.verifyDocument({ actor: actor({ canIssueDocuments: false }), documentId: 'doc1' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
    });

    it('moves it to ISSUED — the one thing the dispatch gate reads', async () => {
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await service.verifyDocument({ actor: actor(), documentId: 'doc1' });
      expect(prisma.document.update.mock.calls[0][0].data.status).toBe('ISSUED');
    });

    it('records who checked it and when', async () => {
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await service.verifyDocument({ actor: actor(), documentId: 'doc1' });
      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.verifiedById).toBe('reviewer');
      expect(data.verifiedAt).toBeInstanceOf(Date);
      expect(prisma.documentEvent.create.mock.calls[0][0].data.type).toBe('VERIFIED');
    });

    it('sends it for signature instead when the type demands one', async () => {
      // Approving decides only that the file is genuine; a document that must
      // be signed still has to be signed.
      prisma.document.findFirst.mockResolvedValue({
        ...PENDING, type: { label: 'Agreement', signatureMode: 'IN_APP' },
      });
      await service.verifyDocument({ actor: actor(), documentId: 'doc1' });
      expect(prisma.document.update.mock.calls[0][0].data.status).toBe('AWAITING_SIGNATURE');
    });

    it('clears an earlier refusal, so an approved resubmission carries no reason', async () => {
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await service.verifyDocument({ actor: actor(), documentId: 'doc1' });
      expect(prisma.document.update.mock.calls[0][0].data.rejectionReason).toBeNull();
    });

    it('will not touch anything that is not waiting for review', async () => {
      /*
        The query itself is the guard: PENDING_VERIFICATION is in the WHERE
        clause, so an already-issued document is simply not found. Re-approving
        one would rewrite `verifiedAt` on something nobody re-examined.
      */
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(
        service.verifyDocument({ actor: actor(), documentId: 'already-issued' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.document.findFirst.mock.calls[0][0].where).toMatchObject({
        status: 'PENDING_VERIFICATION',
      });
    });

    it('scopes the lookup by organization', async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(
        service.verifyDocument({ actor: actor(), documentId: 'someone-elses' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.document.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: 'org1',
      });
    });

    it('tells the member it was accepted', async () => {
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await service.verifyDocument({ actor: actor(), documentId: 'doc1' });
      const [event, payload] = notifications.emit.mock.calls[0];
      expect(event).toBe('document_reviewed');
      expect(payload).toMatchObject({ userId: 'member1', accepted: true, reason: null });
    });
  });

  // ── Refusing ──────────────────────────────────────────────────────────────

  describe('rejectDocument', () => {
    it('refuses somebody who cannot issue documents', async () => {
      await expect(
        service.rejectDocument({
          actor: actor({ canIssueDocuments: false }), documentId: 'doc1', reason: 'blurred',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('demands a reason', async () => {
      /*
        "Not accepted" on its own is an instruction to upload the same
        photograph again — and the second attempt fails for the reason nobody
        gave, which is how somebody ends up unable to work over a blurred
        corner.
      */
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await expect(
        service.rejectDocument({ actor: actor(), documentId: 'doc1', reason: '   ' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('checks the reason BEFORE looking the document up', async () => {
      // Cheap check first; it also means a missing reason cannot be used to
      // probe which document ids exist.
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await expect(
        service.rejectDocument({ actor: actor(), documentId: 'doc1', reason: '' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
    });

    it('stores the reason on the row, where the member’s own list reads it', async () => {
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await service.rejectDocument({
        actor: actor(), documentId: 'doc1', reason: '  The photo is too blurred  ',
      });
      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.status).toBe('REJECTED');
      expect(data.rejectionReason).toBe('The photo is too blurred');
    });

    it('writes the reason into the trail as well as onto the row', async () => {
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await service.rejectDocument({ actor: actor(), documentId: 'doc1', reason: 'Wrong document' });
      const event = prisma.documentEvent.create.mock.calls[0][0].data;
      expect(event.type).toBe('REJECTED');
      expect(event.meta).toEqual({ reason: 'Wrong document' });
      expect(event.actorId).toBe('reviewer');
    });

    it('will not refuse a document that was never submitted for review', async () => {
      // "Rejecting" a payslip the organization issued is not a review — it is a
      // way to make a record disappear from somebody's file.
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(
        service.rejectDocument({ actor: actor(), documentId: 'a-payslip', reason: 'no' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('tells the member, and carries the reason into the message', async () => {
      // A refusal they have to open the app to understand is one they act on a
      // day later.
      prisma.document.findFirst.mockResolvedValue(PENDING);
      await service.rejectDocument({ actor: actor(), documentId: 'doc1', reason: 'Too blurred' });
      const [, payload] = notifications.emit.mock.calls[0];
      expect(payload).toMatchObject({ accepted: false, reason: 'Too blurred' });
    });

    it('does not undo the decision when the notification queue is down', async () => {
      prisma.document.findFirst.mockResolvedValue(PENDING);
      notifications.emit.mockImplementationOnce(() => { throw new Error('redis down'); });
      await expect(
        service.rejectDocument({ actor: actor(), documentId: 'doc1', reason: 'Too blurred' }),
      ).resolves.toBeTruthy();
    });
  });
});
