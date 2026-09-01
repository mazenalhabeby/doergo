import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialExpiryService } from '../credential-expiry.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Retention, and a member taking their file away.
 *
 * Both are about the same thing from opposite ends: what an organization is
 * obliged to keep, and what a person is entitled to have.
 */

describe('retention sweep', () => {
  let service: CredentialExpiryService;
  const prisma: Record<string, any> = {
    document: { updateMany: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    user: { findMany: jest.fn() },
  };

  const NOW = new Date('2026-08-29T02:00:00Z');
  const originalEnv = process.env.DOCUMENT_RETENTION_ENABLED;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.findMany.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        CredentialExpiryService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(CredentialExpiryService);
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.DOCUMENT_RETENTION_ENABLED;
    else process.env.DOCUMENT_RETENTION_ENABLED = originalEnv;
  });

  it('deletes nothing unless an operator switched it on', async () => {
    // Removing employment records must never start happening because a service
    // was upgraded. The same opt-in shape as the task-event prune beside it.
    delete process.env.DOCUMENT_RETENTION_ENABLED;
    expect(await service.pruneExpiredRetention(NOW)).toBe(0);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('stays off for any value other than the exact opt-in', async () => {
    process.env.DOCUMENT_RETENTION_ENABLED = 'yes';
    expect(await service.pruneExpiredRetention(NOW)).toBe(0);
    process.env.DOCUMENT_RETENTION_ENABLED = '1';
    expect(await service.pruneExpiredRetention(NOW)).toBe(0);
  });

  describe('once enabled', () => {
    beforeEach(() => { process.env.DOCUMENT_RETENTION_ENABLED = 'true'; });

    it('never touches a document with no retention date', async () => {
      await service.pruneExpiredRetention(NOW);
      const where = prisma.document.findMany.mock.calls[0][0].where;
      // Null means "keep indefinitely" — a written reference must be
      // producible for thirty years — not "nobody decided".
      expect(where.retentionUntil).toEqual({ not: null, lt: NOW });
    });

    it('NEVER deletes a signed document, whatever the rule says', async () => {
      await service.pruneExpiredRetention(NOW);
      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where.status.notIn).toContain('SIGNED');
      // …nor one still waiting on a signature, which nobody has finished with.
      expect(where.status.notIn).toContain('AWAITING_SIGNATURE');
    });

    it('works in capped batches so no single delete holds a long lock', async () => {
      prisma.document.findMany.mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, i) => ({ id: `d${i}` })),
      );
      prisma.document.deleteMany.mockResolvedValueOnce({ count: 500 });
      prisma.document.findMany.mockResolvedValueOnce([{ id: 'last' }]);
      prisma.document.deleteMany.mockResolvedValueOnce({ count: 1 });

      expect(await service.pruneExpiredRetention(NOW)).toBe(501);
      expect(prisma.document.findMany.mock.calls[0][0].take).toBe(500);
    });

    it('stops as soon as a batch comes back short', async () => {
      prisma.document.findMany.mockResolvedValueOnce([{ id: 'a' }]);
      prisma.document.deleteMany.mockResolvedValueOnce({ count: 1 });
      await service.pruneExpiredRetention(NOW);
      expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
    });

    it('does nothing when nothing is due', async () => {
      expect(await service.pruneExpiredRetention(NOW)).toBe(0);
      expect(prisma.document.deleteMany).not.toHaveBeenCalled();
    });
  });
});

describe('exporting a member’s file', () => {
  let service: DocumentsService;
  const objects = new Map<string, Buffer>();
  const store = {
    presignDownload: jest.fn(async (k: string, name?: string, ttl?: number) =>
      `https://example.invalid/${k}?ttl=${ttl}`),
    presignUpload: jest.fn(), put: jest.fn(), get: jest.fn(),
    head: jest.fn(), delete: jest.fn(),
  };
  const prisma: Record<string, any> = {
    document: { findMany: jest.fn() },
    documentEvent: { createMany: jest.fn() },
    documentSigner: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const me: DocumentActor = {
    userId: 'u-monika', organizationId: 'org1',
    canViewMemberDocuments: false, canOpenMemberDocuments: false,
    canIssueDocuments: false, canManageDocumentTemplates: false,
  };

  const doc = (id: string, over: Record<string, unknown> = {}) => ({
    id, title: `Payslip ${id}`, storageKey: `k-${id}`, sha256: `sha-${id}`,
    sizeBytes: 100, mimeType: 'application/pdf', status: 'ISSUED',
    issuedAt: new Date('2026-08-01'), periodYear: 2026, periodMonth: 8,
    type: { key: 'payslip', label: 'Payslip', direction: 'ISSUED' },
    // A list now: a document can carry a chain of signatures, and an
    // unsigned one carries an empty chain rather than a null.
    signatures: [], ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    objects.clear();
    prisma.document.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        // Stubbed: every test here is about who may file what, not about
        // reading pixels — and a real WASM engine per suite would add minutes.
        { provide: MrzOcrService, useValue: { read: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('needs no permission for your own file', async () => {
    await expect(service.exportForMember({ actor: me })).resolves.toMatchObject({ count: 0 });
  });

  it('refuses somebody else’s file without canOpenMemberDocuments', async () => {
    // A subject access request is about YOUR data; another person's export is
    // their file, and reading it is the same act as opening one document.
    await expect(
      service.exportForMember({ actor: me, targetUserId: 'someone-else' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows it with that permission', async () => {
    await expect(
      service.exportForMember({
        actor: { ...me, canOpenMemberDocuments: true },
        targetUserId: 'u-mike',
      }),
    ).resolves.toMatchObject({ count: 0 });
  });

  it('returns links and a manifest, never the bytes', async () => {
    prisma.document.findMany.mockResolvedValue([doc('a'), doc('b')]);
    const res = await service.exportForMember({ actor: me });

    expect(res.count).toBe(2);
    expect(res.files[0]).toMatchObject({ title: 'Payslip a', sha256: 'sha-a', type: 'Payslip' });
    expect(res.files[0]!.url).toContain('k-a');
    // A fifty-document archive assembled in a Node process is exactly what the
    // rest of this feature refuses to do.
    expect(JSON.stringify(res)).not.toContain('storageKey');
  });

  it('includes the hash, so the recipient can verify what they downloaded', async () => {
    prisma.document.findMany.mockResolvedValue([doc('a')]);
    const res = await service.exportForMember({ actor: me });
    expect(res.files[0]!.sha256).toBe('sha-a');
  });

  it('gives a longer link than a single open — fifty files take more than a minute', async () => {
    prisma.document.findMany.mockResolvedValue([doc('a')]);
    await service.exportForMember({ actor: me });
    expect(store.presignDownload.mock.calls[0][2]).toBe(15 * 60);
  });

  it('records a read against every document in the export', async () => {
    prisma.document.findMany.mockResolvedValue([doc('a'), doc('b')]);
    await service.exportForMember({ actor: me, ctx: { ip: '1.2.3.4' } });
    const written = prisma.documentEvent.createMany.mock.calls[0][0].data;
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({ type: 'DOWNLOADED', actorId: 'u-monika', ip: '1.2.3.4' });
  });

  it('writes no events for an empty file', async () => {
    await service.exportForMember({ actor: me });
    expect(prisma.documentEvent.createMany).not.toHaveBeenCalled();
  });

  it('excludes staged drafts, which the member has never seen', async () => {
    await service.exportForMember({ actor: me });
    const where = prisma.document.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'DRAFT' });
    expect(where.organizationId).toBe('org1');
    expect(where.userId).toBe('u-monika');
  });

  it('carries the signature date for anything signed', async () => {
    prisma.document.findMany.mockResolvedValue([
      doc('c', { status: 'SIGNED', signatures: [{ signedAt: new Date('2026-08-29'), hashAfter: 'x' }] }),
    ]);
    const res = await service.exportForMember({ actor: me });
    expect(res.files[0]!.signedAt).toEqual(new Date('2026-08-29'));
  });
});
