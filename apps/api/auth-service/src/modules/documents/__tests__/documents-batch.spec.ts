import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Payroll day.
 *
 * The guarantee under test is all-or-nothing. Publishing the rows that resolved
 * and leaving the rest would put some payslips out while hiding the problem in
 * a half-finished screen — and one payslip in the wrong hands cannot be taken
 * back. Everything else here follows from that.
 */
describe('DocumentsService — the staged batch', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    document: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    documentEvent: { create: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const notifications = { emit: jest.fn() };

  const issuer: DocumentActor = {
    userId: 'admin1',
    organizationId: 'org1',
    canViewMemberDocuments: true,
    canOpenMemberDocuments: true,
    canIssueDocuments: true,
    canManageDocumentTemplates: true,
  };
  const nobody: DocumentActor = { ...issuer, canIssueDocuments: false };

  const draft = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    title: `Payslip ${id}`,
    status: 'DRAFT',
    organizationId: 'org1',
    user: { id: `u-${id}`, firstName: 'A', lastName: 'B', email: `${id}@example.com` },
    type: { label: 'Payslip', signatureMode: 'NONE' },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.document.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));

    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        // Stubbed: every test here is about who may file what, not about
        // reading pixels — and a real WASM engine per suite would add minutes.
        { provide: MrzOcrService, useValue: { read: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notifications },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  describe('permission', () => {
    it('refuses every batch operation without canIssueDocuments', async () => {
      await expect(service.listDrafts({ actor: nobody })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.publishBatch({ actor: nobody, documentIds: ['d1'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.discardDraft({ actor: nobody, documentId: 'd1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.listMatchCandidates({ actor: nobody })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('listMatchCandidates', () => {
    it('offers only active members of the caller’s organization', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.listMatchCandidates({ actor: issuer });
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ organizationId: 'org1', isActive: true });
    });

    it('selects an explicit column list — never a permission or a hash', async () => {
      /*
        An allow-list, not a fixed list: the template screen needs `position`
        and `memberRoleId` to say who a contract will reach, and pinning the
        exact four columns turned that into a test failure rather than the
        review question it should be. What must never widen is the KIND of
        column — a credential, a permission flag, or anything about pay.
      */
      prisma.user.findMany.mockResolvedValue([]);
      await service.listMatchCandidates({ actor: issuer });
      const select = prisma.user.findMany.mock.calls[0][0].select;

      const ALLOWED = ['id', 'firstName', 'lastName', 'email', 'position', 'memberRoleId'];
      expect(Object.keys(select).filter((k) => !ALLOWED.includes(k))).toEqual([]);
      // Named outright, so a rename cannot quietly reintroduce one.
      for (const forbidden of ['passwordHash', 'password', 'canManageUsers', 'hourlyRate', 'salary']) {
        expect(select[forbidden]).toBeUndefined();
      }
    });
  });

  describe('publishBatch', () => {
    it('publishes every staged row in one transaction', async () => {
      prisma.document.findMany.mockResolvedValue([draft('d1'), draft('d2'), draft('d3')]);
      const res = await service.publishBatch({ actor: issuer, documentIds: ['d1', 'd2', 'd3'] });

      expect(res).toEqual({ published: 3 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.document.update).toHaveBeenCalledTimes(3);
    });

    it('writes an ISSUED event per document — the trail starts here', async () => {
      prisma.document.findMany.mockResolvedValue([draft('d1'), draft('d2')]);
      await service.publishBatch({ actor: issuer, documentIds: ['d1', 'd2'] });
      expect(prisma.documentEvent.create).toHaveBeenCalledTimes(2);
      expect(prisma.documentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'ISSUED', actorId: 'admin1' }) }),
      );
    });

    it('publishes NOTHING when one id is not staged', async () => {
      // Two of three come back — the third was published a moment ago by
      // someone else, or belongs to another tenant. Either way, stop.
      prisma.document.findMany.mockResolvedValue([draft('d1'), draft('d2')]);
      await expect(
        service.publishBatch({ actor: issuer, documentIds: ['d1', 'd2', 'gone'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(notifications.emit).not.toHaveBeenCalled();
    });

    it('scopes the lookup by organization AND status', async () => {
      prisma.document.findMany.mockResolvedValue([draft('d1')]);
      await service.publishBatch({ actor: issuer, documentIds: ['d1'] });
      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe('org1');
      expect(where.status).toBe('DRAFT');
      // An id from another tenant is simply not found, and the count check then
      // refuses the whole batch rather than publishing the rest.
    });

    it('refuses an empty batch', async () => {
      await expect(
        service.publishBatch({ actor: issuer, documentIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('de-duplicates ids rather than publishing one row twice', async () => {
      prisma.document.findMany.mockResolvedValue([draft('d1')]);
      const res = await service.publishBatch({ actor: issuer, documentIds: ['d1', 'd1'] });
      expect(res).toEqual({ published: 1 });
    });

    it('notifies once per member, after the transaction commits', async () => {
      prisma.document.findMany.mockResolvedValue([draft('d1'), draft('d2')]);
      await service.publishBatch({ actor: issuer, documentIds: ['d1', 'd2'] });
      // Emitting inside the transaction would tell people about documents a
      // rollback then un-published.
      expect(notifications.emit).toHaveBeenCalledTimes(2);
      expect(notifications.emit).toHaveBeenCalledWith(
        'document_issued',
        expect.objectContaining({ typeLabel: 'Payslip' }),
      );
    });

    it('sends a document needing signature to AWAITING_SIGNATURE, not ISSUED', async () => {
      prisma.document.findMany.mockResolvedValue([
        draft('c1', { type: { label: 'Contract', signatureMode: 'IN_APP' } }),
      ]);
      await service.publishBatch({ actor: issuer, documentIds: ['c1'] });
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'AWAITING_SIGNATURE' }) }),
      );
      expect(notifications.emit).toHaveBeenCalledWith(
        'document_issued',
        expect.objectContaining({ needsSignature: true }),
      );
    });

    it('does not let a failed notification undo a published batch', async () => {
      prisma.document.findMany.mockResolvedValue([draft('d1')]);
      notifications.emit.mockImplementationOnce(() => {
        throw new Error('notification service is down');
      });
      // The document exists whether or not the phone was reachable.
      await expect(service.publishBatch({ actor: issuer, documentIds: ['d1'] })).resolves.toEqual({
        published: 1,
      });
    });
  });

  describe('discardDraft', () => {
    it('hard-deletes a staged row, since nothing was ever issued', async () => {
      prisma.document.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(service.discardDraft({ actor: issuer, documentId: 'd1' })).resolves.toEqual({
        success: true,
      });
      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    });

    it('will not touch anything already published', async () => {
      // Scoped to status DRAFT, so a published document is simply not found —
      // withdrawing one is `revoke`, which keeps the record.
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(
        service.discardDraft({ actor: issuer, documentId: 'published' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const where = prisma.document.findFirst.mock.calls[0][0].where;
      expect(where.status).toBe('DRAFT');
      expect(where.organizationId).toBe('org1');
    });
  });

  describe('listDrafts', () => {
    it('returns only this organization’s staged rows, oldest first', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      await service.listDrafts({ actor: issuer });
      const call = prisma.document.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ organizationId: 'org1', status: 'DRAFT' });
      expect(call.orderBy).toEqual({ createdAt: 'asc' });
    });
  });
});
