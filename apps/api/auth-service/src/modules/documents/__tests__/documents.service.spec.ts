import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Who can reach whose documents.
 *
 * A payslip is the most sensitive object in this product, so these assertions
 * are about refusal rather than about happy paths. Storage is deliberately left
 * unconfigured for most of them: the authorization decision must be reached
 * before anything touches S3, and a test that needed credentials to prove a
 * refusal would be testing the wrong layer.
 */
describe('DocumentsService — who can reach whose documents', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    documentType: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    document: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    documentEvent: { create: jest.fn(), findMany: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const notifications = { emit: jest.fn() };

  const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId: 'me',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
    ...over,
  });

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
        /*
          Deliberately null — "storage is not configured".

          Every assertion in this file is about a REFUSAL, and the point is that
          the refusal is reached before anything touches storage. If these passed
          only with a working store, they would not be proving the ordering that
          matters: a caller with no entitlement must never learn that a document
          exists from a "storage unavailable" error.
        */
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  // ── Reading your own file ─────────────────────────────────────────────────

  describe('listForMember', () => {
    it('lets anyone read their own file with no permission at all', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await expect(service.listForMember({ actor: actor() })).resolves.toEqual([]);
    });

    it('scopes the query by organization AND user, in the where clause', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await service.listForMember({ actor: actor() });

      const where = prisma.document.findMany.mock.calls[0][0].where;
      // Both, always. Filtering after the fetch is how the last IDOR happened.
      expect(where.organizationId).toBe('org1');
      expect(where.userId).toBe('me');
    });

    it('refuses another member’s list without canViewMemberDocuments', async () => {
      await expect(
        service.listForMember({ actor: actor(), targetUserId: 'someone-else' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Refused before any query — the check is not a filter on results.
      expect(prisma.document.findMany).not.toHaveBeenCalled();
    });

    it('allows another member’s list with canViewMemberDocuments', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u2', firstName: 'A', lastName: 'B', email: 'a@b.c' });
      prisma.document.findMany.mockResolvedValue([]);
      await expect(
        service.listForMember({ actor: actor({ canViewMemberDocuments: true }), targetUserId: 'u2' }),
      ).resolves.toEqual([]);
    });

    it('404s a target in another organization rather than saying they exist', async () => {
      // findFirst is scoped by organizationId, so a real user in another tenant
      // comes back null and is indistinguishable from a made-up id.
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.listForMember({ actor: actor({ canViewMemberDocuments: true }), targetUserId: 'foreign' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks a never-opened document unread, and a signature request blocking', async () => {
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'd1', title: 'August', typeId: 't1', periodYear: 2026, periodMonth: 8,
          status: 'AWAITING_SIGNATURE', sizeBytes: 100, mimeType: 'application/pdf',
          issuedAt: new Date('2026-08-25'), expiresOn: null, firstOpenedAt: null,
          type: { key: 'contract', label: 'Contract', signatureMode: 'IN_APP', isCredential: false },
        },
      ]);
      const [row] = await service.listForMember({ actor: actor() });
      expect(row.unread).toBe(true);
      expect(row.needsSignature).toBe(true);
      // Not a credential, so it has no expiry standing to report.
      expect(row.standing).toBeNull();
    });

    it('reports a standing for credentials only', async () => {
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'c1', title: 'Licence', typeId: 't2', periodYear: null, periodMonth: null,
          status: 'ISSUED', sizeBytes: 1, mimeType: 'application/pdf',
          issuedAt: new Date('2020-01-01'), expiresOn: new Date('2020-02-01'),
          firstOpenedAt: new Date('2020-01-02'),
          type: { key: 'licence', label: 'Licence', signatureMode: 'NONE', isCredential: true },
        },
      ]);
      const [row] = await service.listForMember({ actor: actor() });
      expect(row.standing).toBe('EXPIRED');
      expect(row.unread).toBe(false);
    });
  });

  // ── Opening ───────────────────────────────────────────────────────────────

  describe('getDownloadUrl', () => {
    it('refuses a colleague’s document without canOpenMemberDocuments', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'd1', userId: 'someone-else', storageKey: 'k', mimeType: 'application/pdf',
        title: 'Payslip', firstOpenedAt: null, type: { label: 'Payslip' },
      });
      await expect(
        service.getDownloadUrl({ actor: actor({ canViewMemberDocuments: true }), documentId: 'd1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not let canViewMemberDocuments stand in for opening', async () => {
      // The two are separate powers on purpose: a dispatcher may need to know a
      // certificate expires on Friday without being able to read a salary.
      prisma.document.findFirst.mockResolvedValue({
        id: 'd1', userId: 'other', storageKey: 'k', mimeType: 'application/pdf',
        title: 'Payslip', firstOpenedAt: null, type: { label: 'Payslip' },
      });
      const viewer = actor({ canViewMemberDocuments: true, canOpenMemberDocuments: false });
      await expect(service.getDownloadUrl({ actor: viewer, documentId: 'd1' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404s a document belonging to another organization', async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(
        service.getDownloadUrl({ actor: actor({ canOpenMemberDocuments: true }), documentId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const where = prisma.document.findFirst.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org1');
    });
  });

  // ── Issuing ───────────────────────────────────────────────────────────────

  describe('issuing', () => {
    it('refuses to mint an upload link without canIssueDocuments', async () => {
      await expect(
        service.presignUpload({
          actor: actor(), userId: 'u2', typeId: 't1',
          mimeType: 'application/pdf', sizeBytes: 100,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a staging key that points outside the caller’s organization', async () => {
      // The key comes back from the client, so it is the one place a caller
      // could try to reach another tenant's objects.
      await expect(
        service.confirmUpload({
          actor: actor({ canIssueDocuments: true }),
          stagingKey: 'org-other/documents/_staging/abc.pdf',
          userId: 'u2', typeId: 't1', title: 'Payslip',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a staging key containing a traversal segment', async () => {
      await expect(
        service.confirmUpload({
          actor: actor({ canIssueDocuments: true }),
          stagingKey: 'org1/documents/_staging/../../../etc/passwd',
          userId: 'u2', typeId: 't1', title: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── Withdrawing and deleting ──────────────────────────────────────────────

  describe('revoke', () => {
    it('refuses without canIssueDocuments', async () => {
      await expect(
        service.revoke({ actor: actor(), documentId: 'd1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to withdraw a SIGNED document', async () => {
      // A signed contract the issuer could erase would be worth nothing as
      // evidence — which is precisely what it exists to be.
      prisma.document.findFirst.mockResolvedValue({ id: 'd1', status: 'SIGNED' });
      await expect(
        service.revoke({ actor: actor({ canIssueDocuments: true }), documentId: 'd1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteOwnSupplied', () => {
    it('lets a member remove something they supplied', async () => {
      prisma.document.findFirst.mockResolvedValue({ id: 'd1', type: { direction: 'SUPPLIED' } });
      prisma.document.delete.mockResolvedValue({});
      await expect(service.deleteOwnSupplied({ actor: actor(), documentId: 'd1' })).resolves.toEqual({
        success: true,
      });
    });

    it('refuses to let a member delete a document ISSUED to them', async () => {
      prisma.document.findFirst.mockResolvedValue({ id: 'd1', type: { direction: 'ISSUED' } });
      await expect(
        service.deleteOwnSupplied({ actor: actor(), documentId: 'd1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.document.delete).not.toHaveBeenCalled();
    });

    it('only ever looks at the caller’s own documents', async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteOwnSupplied({ actor: actor(), documentId: 'someone-elses' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const where = prisma.document.findFirst.mock.calls[0][0].where;
      expect(where.userId).toBe('me');
      expect(where.organizationId).toBe('org1');
    });
  });

  // ── Type management ───────────────────────────────────────────────────────

  describe('document types', () => {
    it('refuses to create a type without canManageDocumentTemplates', async () => {
      await expect(
        service.createType({ actor: actor({ canIssueDocuments: true }), key: 'payslip', label: 'Payslip' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('normalises a key to something stable and machine-safe', async () => {
      prisma.documentType.create.mockResolvedValue({});
      await service.createType({
        actor: actor({ canManageDocumentTemplates: true }),
        key: '  Pay Slip / Monthly!  ',
        label: 'Payslip',
      });
      expect(prisma.documentType.create.mock.calls[0][0].data.key).toBe('pay_slip_monthly');
    });

    it('defaults hasExpiry on for a credential, since that is why it is one', async () => {
      prisma.documentType.create.mockResolvedValue({});
      await service.createType({
        actor: actor({ canManageDocumentTemplates: true }),
        key: 'gas_safe', label: 'Gas Safe', isCredential: true,
      });
      expect(prisma.documentType.create.mock.calls[0][0].data.hasExpiry).toBe(true);
    });

    it('still allows a credential that never lapses', async () => {
      prisma.documentType.create.mockResolvedValue({});
      await service.createType({
        actor: actor({ canManageDocumentTemplates: true }),
        key: 'degree', label: 'Degree', isCredential: true, hasExpiry: false,
      });
      expect(prisma.documentType.create.mock.calls[0][0].data.hasExpiry).toBe(false);
    });

    it('retires a type instead of deleting it', async () => {
      prisma.documentType.findFirst.mockResolvedValue({ id: 't1' });
      prisma.documentType.update.mockResolvedValue({});
      await service.deactivateType({ actor: actor({ canManageDocumentTemplates: true }), id: 't1' });
      // The documents filed under it must stay readable.
      expect(prisma.documentType.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { isActive: false },
      });
    });
  });
});
