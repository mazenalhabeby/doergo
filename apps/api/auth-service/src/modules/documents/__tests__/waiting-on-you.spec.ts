import { Test } from '@nestjs/testing';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * "Needs your signature" has to mean YOURS.
 *
 * A document with a route stays AWAITING_SIGNATURE until the whole chain is
 * done — that is correct, and it is also why reading the document's status is
 * the wrong question to ask on a member's own screen. It told somebody who had
 * already signed that they still had to, with nothing they could do to clear
 * it: the sign button reopened a document they had signed minutes earlier.
 *
 * The chain knows whose turn it is. These tests are that the member's screen
 * asks it, and that a document with no route keeps its old, correct meaning.
 */
describe('DocumentsService — is this waiting on ME', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: { findMany: jest.fn() },
    documentType: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findFirst: jest.fn() },
  };


  /**
   * Answer the member's OWN documents query with these rows, and the
   * "waiting on me" query with nothing.
   *
   * Two different questions reach `document.findMany` now — the caller's
   * personnel file, and other people's documents parked on the caller's
   * signature. Distinguished by the signer filter, because a mock that answered
   * both with the same rows would have the service reading a payslip as a
   * countersignature request.
   */
  const ownDocuments = (rows: any[]) =>
    prisma.document.findMany.mockImplementation(async (args: any) =>
      args?.where?.signers ? [] : rows,
    );

  const actor = (userId: string): DocumentActor => ({
    userId,
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
  });

  /** The worker has signed; their responsible has not. */
  const chain = [
    { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'worker', customerId: null },
    { order: 2, role: 'RESPONSIBLE', status: 'PENDING', userId: 'anna', customerId: null },
  ];

  const timesheet = (signers: any[]) => ({
    id: 'doc1',
    title: 'Time sheet — September',
    typeId: 't1',
    periodYear: 2026,
    periodMonth: 9,
    status: 'AWAITING_SIGNATURE',
    sizeBytes: 100,
    mimeType: 'application/pdf',
    issuedAt: new Date(),
    expiresOn: null,
    firstOpenedAt: new Date(),
    rejectionReason: null,
    type: { key: 'timesheet', label: 'Time sheet', signatureMode: 'IN_APP', isCredential: false },
    signers,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ id: 'worker', memberRoleId: null });

    const mod = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn(), send: jest.fn() } },
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = mod.get(DocumentsService);
  });

  describe('the member’s own documents', () => {
    const listFor = async (userId: string) =>
      (await service.listForMember({ actor: actor(userId) })) as any[];

    it('stops asking the worker to sign what they have already signed', async () => {
      ownDocuments([timesheet(chain)]);
      const [row] = await listFor('worker');
      expect(row.needsSignature).toBe(false);
    });

    it('asks the worker while it is still their turn', async () => {
      ownDocuments([
        timesheet([{ ...chain[0], status: 'PENDING' }, chain[1]]),
      ]);
      const [row] = await listFor('worker');
      expect(row.needsSignature).toBe(true);
    });

    it('keeps the old meaning for a document with no route at all', async () => {
      // Every document issued before routes existed. AWAITING_SIGNATURE means
      // the person it was issued to has to sign it, and nothing else.
      ownDocuments([timesheet([])]);
      const [row] = await listFor('worker');
      expect(row.needsSignature).toBe(true);
    });

    it('never asks for a signature on something already signed through', async () => {
      ownDocuments([
        { ...timesheet([{ ...chain[0] }, { ...chain[1], status: 'SIGNED' }]), status: 'SIGNED' },
      ]);
      const [row] = await listFor('worker');
      expect(row.needsSignature).toBe(false);
    });
  });

  describe('the mobile home screen', () => {
    const toSign = async (userId: string) => {
      prisma.user.findFirst.mockResolvedValue({ id: userId, memberRoleId: null });
      const res: any = await service.pendingForMember({ actor: actor(userId) });
      return res.toSign.map((d: any) => d.id);
    };

    beforeEach(() => {
      // Second call = "somebody else's, waiting on me". Empty unless a test
      // says otherwise.
      prisma.document.findMany.mockImplementation(async () => []);
    });

    it('drops the document off the worker’s list the moment they sign', async () => {
      ownDocuments([timesheet(chain)]);
      expect(await toSign('worker')).toEqual([]);
    });

    it('puts it on the responsible’s list instead, named for whose it is', async () => {
      /*
        Anna is not the subject of this document, so it is not in her personnel
        file and the first query cannot return it. It reaches her through the
        signer row — which is the whole point: before this she got a push
        notification about a document that existed nowhere in her app.
      */
      prisma.document.findMany
        .mockResolvedValueOnce([]) // her own file: nothing
        .mockResolvedValueOnce([
          { ...timesheet(chain), user: { firstName: 'Mike', lastName: 'Weber' } },
        ]);

      const res: any = await service.pendingForMember({ actor: actor('anna') });
      expect(res.toSign).toEqual([
        expect.objectContaining({ id: 'doc1', forMember: 'Mike Weber' }),
      ]);
    });

    it('does not show it to the responsible before it is her turn', async () => {
      // The worker has not signed yet. Step 2 is pending in the row sense but
      // it is not the CURRENT step, and a manager's list filling up with work
      // that has not arrived is how a list stops being read.
      prisma.document.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            ...timesheet([{ ...chain[0], status: 'PENDING' }, chain[1]]),
            user: { firstName: 'Mike', lastName: 'Weber' },
          },
        ]);

      const res: any = await service.pendingForMember({ actor: actor('anna') });
      expect(res.toSign).toEqual([]);
    });

    it('still lists an unrouted document for the person it was issued to', async () => {
      ownDocuments([timesheet([])]);
      expect(await toSign('worker')).toEqual(['doc1']);
    });
  });
});
