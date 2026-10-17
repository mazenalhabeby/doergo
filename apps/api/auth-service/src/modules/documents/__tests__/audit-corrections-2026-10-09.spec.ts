import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { DOCUMENT_SERVICES } from '../document-services';
import { credentialExpiryParts } from './credential-expiry.service.fixture';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * The personnel-file corrections from the 2026-10-09 audit.
 *
 *   who may SEE a type is the visibility permission, not the template one
 *   a type names only this organization's roles and workflows
 *   nobody reviews — or files as ISSUED — a credential about themselves
 *   the evidence trail keeps other people's ip/device/position to the office
 *   refusals on reads are 404, never 403
 *   the compliance board obeys the type restriction
 */
describe('documents — audit corrections 2026-10-09', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    documentType: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    accessRole: { count: jest.fn() },
    statusWorkflow: { count: jest.fn() },
    document: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    documentEvent: { findMany: jest.fn(), create: jest.fn() },
    documentSigner: { findMany: jest.fn(), count: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId: 'me',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: true,
    canManageDocumentTemplates: true,
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ...DOCUMENT_SERVICES,
        { provide: MrzOcrService, useValue: { read: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: {} },
      ],
    }).compile();
    service = module.get(DocumentsService);
    prisma.documentType.create.mockImplementation(({ data }: any) => ({ id: 't1', ...data }));
    prisma.documentType.update.mockImplementation(({ data }: any) => ({ id: 't1', ...data }));
    prisma.accessRole.count.mockImplementation(({ where }: any) => where.id.in.length);
    prisma.statusWorkflow.count.mockImplementation(({ where }: any) => where.id.in.length);
  });

  // ── Who may see a type ────────────────────────────────────────────────────

  describe('type visibility needs canManageDocumentVisibility', () => {
    it('refuses a template editor naming who may see a new type', async () => {
      await expect(
        service.createType({ actor: actor(), key: 'payslip', label: 'Payslip', visibleToRoleIds: ['r1'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.documentType.create).not.toHaveBeenCalled();
    });

    it('allows it with the visibility permission', async () => {
      await service.createType({
        actor: actor({ canManageDocumentVisibility: true }),
        key: 'payslip',
        label: 'Payslip',
        visibleToRoleIds: ['r1'],
      });
      expect(prisma.documentType.create).toHaveBeenCalled();
    });

    it('refuses CHANGING the list on an edit, but not re-sending the same one', async () => {
      prisma.documentType.findFirst.mockResolvedValue({ id: 't1', twoSided: false, visibleToRoleIds: ['r1'] });
      await expect(
        service.updateType({ actor: actor(), id: 't1', patch: { visibleToRoleIds: ['r1', 'r2'] } }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // A form sends every field — the unchanged list is not a change.
      await service.updateType({ actor: actor(), id: 't1', patch: { label: 'Pay', visibleToRoleIds: ['r1'] } });
      expect(prisma.documentType.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('a type names only this organization’s roles and workflows', () => {
    it('refuses a role from another organization', async () => {
      prisma.accessRole.count.mockResolvedValue(0);
      await expect(
        service.createType({ actor: actor(), key: 'licence', label: 'Licence', requiredFromRoleIds: ['foreign'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.accessRole.count.mock.calls[0][0].where.organizationId).toBe('org1');
    });

    it('refuses a workflow from another organization on an edit', async () => {
      prisma.documentType.findFirst.mockResolvedValue({ id: 't1', twoSided: false, visibleToRoleIds: [] });
      prisma.statusWorkflow.count.mockResolvedValue(0);
      await expect(
        service.updateType({ actor: actor(), id: 't1', patch: { requiredForWorkflowIds: ['wf-x'] } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.documentType.update).not.toHaveBeenCalled();
    });
  });

  // ── Reviewing your own ────────────────────────────────────────────────────

  describe('nobody reviews their own credential', () => {
    const pendingOf = (userId: string) => ({
      id: 'doc1',
      userId,
      status: 'PENDING_VERIFICATION',
      user: { id: userId, firstName: 'A', lastName: 'B', email: 'a@b.c' },
      type: { label: 'Licence', signatureMode: 'NONE', hasExpiry: false },
    });

    it('refuses approving your own document', async () => {
      prisma.document.findFirst.mockResolvedValue(pendingOf('me'));
      await expect(service.verifyDocument({ actor: actor(), documentId: 'doc1' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('refuses rejecting your own document', async () => {
      prisma.document.findFirst.mockResolvedValue(pendingOf('me'));
      await expect(
        service.rejectDocument({ actor: actor(), documentId: 'doc1', reason: 'blurred' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets an administrator review their own', async () => {
      prisma.document.findFirst.mockResolvedValue(pendingOf('me'));
      prisma.$transaction.mockImplementation(async (fn: any) =>
        fn({ document: { update: jest.fn().mockResolvedValue({ id: 'doc1' }) }, documentEvent: { create: jest.fn() } }),
      );
      await expect(service.verifyDocument({ actor: actor({ isAdmin: true }), documentId: 'doc1' })).resolves.toBeTruthy();
    });

    it('refuses filing a credential about yourself straight to ISSUED', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'me', organizationId: 'org1' });
      prisma.documentType.findFirst.mockResolvedValue({ id: 't1', isCredential: true, cadence: 'ONE_OFF' });
      await expect(
        service.confirmUpload({
          actor: actor(),
          stagingKey: 'org1/documents/_staging/x.pdf',
          userId: 'me',
          typeId: 't1',
          title: 'My licence',
        } as never),
      ).rejects.toThrow('Somebody else has to review your own documents');
    });
  });

  // ── The evidence trail ────────────────────────────────────────────────────

  describe('listEvents', () => {
    const DOC = { id: 'doc1', userId: 'me', hiddenFromMember: false, rolesOverridden: false, visibleToRoleIds: [], type: { visibleToRoleIds: [] } };
    const EVENTS = [
      { id: 'e1', actorId: 'me', ip: '1.1.1.1', userAgent: 'mine', lat: 1, lng: 2 },
      { id: 'e2', actorId: 'hr', ip: '2.2.2.2', userAgent: 'theirs', lat: 3, lng: 4 },
    ];

    it('strips other people’s ip, device and position from the subject’s view', async () => {
      prisma.document.findFirst.mockResolvedValue(DOC);
      prisma.documentEvent.findMany.mockResolvedValue(EVENTS);
      const rows: any[] = await service.listEvents({ actor: actor(), documentId: 'doc1' });
      expect(rows[0]).toMatchObject({ ip: '1.1.1.1', userAgent: 'mine', lat: 1, lng: 2 });
      expect(rows[1]).toMatchObject({ ip: null, userAgent: null, lat: null, lng: null });
    });

    it('keeps them for somebody who may open members’ documents', async () => {
      prisma.document.findFirst.mockResolvedValue(DOC);
      prisma.documentEvent.findMany.mockResolvedValue(EVENTS);
      const rows: any[] = await service.listEvents({ actor: actor({ canOpenMemberDocuments: true }), documentId: 'doc1' });
      expect(rows[1].ip).toBe('2.2.2.2');
    });

    it('answers 404, not 403, for a colleague’s document', async () => {
      prisma.document.findFirst.mockResolvedValue({ ...DOC, userId: 'colleague' });
      await expect(service.listEvents({ actor: actor(), documentId: 'doc1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('refusals on reads are 404', () => {
    it('documentChain', async () => {
      prisma.document.findFirst.mockResolvedValue({ id: 'doc1', userId: 'colleague', type: { visibleToRoleIds: [] } });
      prisma.documentSigner.findMany.mockResolvedValue([]);
      await expect(service.documentChain({ actor: actor(), documentId: 'doc1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('listRequirements of somebody else', async () => {
      await expect(
        service.listRequirements({ actor: actor(), targetUserId: 'colleague' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── The compliance board ──────────────────────────────────────────────────

  describe('compliance obeys the type restriction', () => {
    const board = () =>
      credentialExpiryParts(prisma as never, { emit: jest.fn() } as never);

    it('scopes the query by the reader’s role', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await board().listCompliance({ organizationId: 'org1', actor: { userId: 'me', roleId: 'r1' } });
      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(where)).toContain('"has":"r1"');
    });

    it('fails CLOSED without a reader: unrestricted types only', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await board().listCompliance({ organizationId: 'org1' });
      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
      expect(JSON.stringify(where)).toContain('"isEmpty":true');
    });

    it('leaves an administrator unrestricted', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await board().listCompliance({ organizationId: 'org1', actor: { userId: 'me', isAdmin: true } });
      expect(prisma.document.findMany.mock.calls[0][0].where.OR).toBeUndefined();
    });
  });
});
