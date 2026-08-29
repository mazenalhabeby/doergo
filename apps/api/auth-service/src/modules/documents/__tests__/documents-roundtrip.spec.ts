import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { sha256 } from '@hbcfield/shared/storage';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Upload → file → read, with the object store stubbed.
 *
 * The claim under test is the one everything else rests on: THE SERVER HASHES
 * THE BYTES IT READ. A client cannot state a document's hash, its size or its
 * key — if it could, the integrity guarantee would be the client's word, and
 * "this document has not been altered" would mean nothing.
 */
describe('DocumentsService — the upload round trip', () => {
  let service: DocumentsService;

  /** Bytes actually in the store, by key. */
  let objects: Map<string, { body: Buffer; contentType: string }>;

  const store = {
    presignUpload: jest.fn(async (key: string, contentType: string, contentLength: number) => ({
      url: `https://example.invalid/${key}?sig`,
      key,
      headers: { 'Content-Type': contentType, 'Content-Length': String(contentLength) },
      expiresInSeconds: 900,
    })),
    presignDownload: jest.fn(async (key: string) => `https://example.invalid/${key}?get`),
    put: jest.fn(async (key: string, body: Buffer, contentType: string) => {
      objects.set(key, { body, contentType });
    }),
    get: jest.fn(async (key: string) => {
      const o = objects.get(key);
      if (!o) throw new Error(`no such object ${key}`);
      return o.body;
    }),
    head: jest.fn(async (key: string) => {
      const o = objects.get(key);
      return o
        ? { exists: true, sizeBytes: o.body.length, contentType: o.contentType }
        : { exists: false, sizeBytes: 0 };
    }),
    delete: jest.fn(async (key: string) => objects.delete(key)),
  };

  const prisma: Record<string, any> = {
    documentType: { findFirst: jest.fn() },
    document: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    documentEvent: { create: jest.fn() },
    user: { findFirst: jest.fn() },
    // Runs the callback against the same mocks — enough to assert what the
    // transaction writes, which is what these tests are about.
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const issuer: DocumentActor = {
    userId: 'admin1',
    organizationId: 'org1',
    canViewMemberDocuments: true,
    canOpenMemberDocuments: true,
    canIssueDocuments: true,
    canManageDocumentTemplates: true,
  };

  const PAYSLIP = Buffer.from('%PDF-1.4 payslip august 2026');

  beforeEach(async () => {
    jest.clearAllMocks();
    objects = new Map();

    prisma.user.findFirst.mockResolvedValue({
      id: 'mike', firstName: 'Mike', lastName: 'Weber', email: 'mike@example.com',
    });
    prisma.documentType.findFirst.mockResolvedValue({
      id: 'type-payslip', organizationId: 'org1', label: 'Payslip',
      cadence: 'MONTHLY', direction: 'ISSUED', signatureMode: 'NONE',
      retentionMonths: 84, hasExpiry: false, isCredential: false,
    });
    prisma.document.create.mockImplementation(async ({ data }: any) => ({ id: 'doc1', ...data }));

    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  /** Presign, put the bytes where the client would, then confirm. */
  async function upload(bytes: Buffer, over: Record<string, unknown> = {}) {
    const presigned = await service.presignUpload({
      actor: issuer, userId: 'mike', typeId: 'type-payslip',
      mimeType: 'application/pdf', sizeBytes: bytes.length,
    });
    objects.set(presigned.key, { body: bytes, contentType: 'application/pdf' });
    return service.confirmUpload({
      actor: issuer,
      stagingKey: presigned.key,
      userId: 'mike',
      typeId: 'type-payslip',
      title: 'Payslip August 2026',
      periodYear: 2026,
      periodMonth: 8,
      ...over,
    });
  }

  it('presigns into a staging key scoped to the caller’s organization', async () => {
    const p = await service.presignUpload({
      actor: issuer, userId: 'mike', typeId: 'type-payslip',
      mimeType: 'application/pdf', sizeBytes: 100,
    });
    expect(p.key.startsWith('org1/documents/_staging/')).toBe(true);
    expect(p.key.endsWith('.pdf')).toBe(true);
  });

  it('writes nothing to the database at presign time', async () => {
    await service.presignUpload({
      actor: issuer, userId: 'mike', typeId: 'type-payslip',
      mimeType: 'application/pdf', sizeBytes: 100,
    });
    // An abandoned upload must leave no row. A row pointing at bytes that never
    // arrived shows the member a document that cannot be opened.
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('hashes the bytes the SERVER read, not anything the client said', async () => {
    const doc = await upload(PAYSLIP);
    expect(doc.sha256).toBe(sha256(PAYSLIP));
    expect(doc.sizeBytes).toBe(PAYSLIP.length);
    // Proof it actually fetched them rather than trusting the announced size.
    expect(store.get).toHaveBeenCalled();
  });

  it('files the object under a content-addressed key', async () => {
    const doc = await upload(PAYSLIP);
    const hash = sha256(PAYSLIP);
    expect(doc.storageKey).toBe(`org1/documents/${hash.slice(0, 2)}/${hash}.pdf`);
    expect(objects.has(doc.storageKey)).toBe(true);
  });

  it('stores identical bytes under one key, however many members get them', async () => {
    const a = await upload(PAYSLIP);
    const b = await upload(PAYSLIP);
    // One safety policy issued to thirty people is one object — and each still
    // gets their own row.
    expect(b.storageKey).toBe(a.storageKey);
    expect([...objects.keys()].filter((k) => !k.includes('_staging'))).toHaveLength(1);
    expect(prisma.document.create).toHaveBeenCalledTimes(2);
  });

  it('removes the staging object once the real one is filed', async () => {
    await upload(PAYSLIP);
    expect([...objects.keys()].some((k) => k.includes('_staging'))).toBe(false);
  });

  it('computes retention from the type, not from a client field', async () => {
    const doc = await upload(PAYSLIP);
    // Asserted, not optional-chained: a null here is the failure, and silently
    // skipping the arithmetic would let it pass.
    expect(doc.retentionUntil).toBeInstanceOf(Date);
    const until = doc.retentionUntil as Date;
    const months =
      (until.getUTCFullYear() - doc.issuedAt.getUTCFullYear()) * 12 +
      (until.getUTCMonth() - doc.issuedAt.getUTCMonth());
    expect(months).toBe(84); // seven years, as the type says
  });

  it('records an ISSUED event in the same transaction as the document', async () => {
    await upload(PAYSLIP);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.documentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ISSUED', actorId: 'admin1' }) }),
    );
  });

  it('refuses when the upload never arrived, rather than filing a broken row', async () => {
    const p = await service.presignUpload({
      actor: issuer, userId: 'mike', typeId: 'type-payslip',
      mimeType: 'application/pdf', sizeBytes: 100,
    });
    // Deliberately do NOT put the bytes.
    await expect(
      service.confirmUpload({
        actor: issuer, stagingKey: p.key, userId: 'mike',
        typeId: 'type-payslip', title: 'Nothing', periodYear: 2026, periodMonth: 8,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('refuses a period the type’s cadence cannot carry', async () => {
    // MONTHLY without a month cannot be grouped by month, so the list would be
    // wrong rather than merely odd.
    await expect(upload(PAYSLIP, { periodMonth: undefined })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a file type that is not on the allow-list', async () => {
    await expect(
      service.presignUpload({
        actor: issuer, userId: 'mike', typeId: 'type-payslip',
        mimeType: 'application/x-msdownload', sizeBytes: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a file over the size limit before minting any link', async () => {
    await expect(
      service.presignUpload({
        actor: issuer, userId: 'mike', typeId: 'type-payslip',
        mimeType: 'application/pdf', sizeBytes: 26 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.presignUpload).not.toHaveBeenCalled();
  });

  it('requires an expiry date for a credential type', async () => {
    prisma.documentType.findFirst.mockResolvedValue({
      id: 'type-licence', organizationId: 'org1', label: 'Licence',
      cadence: 'ONE_OFF', direction: 'SUPPLIED', signatureMode: 'NONE',
      retentionMonths: null, hasExpiry: true, isCredential: true,
    });
    const p = await service.presignUpload({
      actor: issuer, userId: 'mike', typeId: 'type-licence',
      mimeType: 'application/pdf', sizeBytes: PAYSLIP.length,
    });
    objects.set(p.key, { body: PAYSLIP, contentType: 'application/pdf' });
    // A credential with no date can never expire, so it could never gate a
    // dispatch — which is the only reason it is being stored.
    await expect(
      service.confirmUpload({
        actor: issuer, stagingKey: p.key, userId: 'mike',
        typeId: 'type-licence', title: 'Driving licence',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('opening', () => {
    beforeEach(() => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc1', userId: 'mike', organizationId: 'org1',
        storageKey: 'org1/documents/ab/abc.pdf', mimeType: 'application/pdf',
        title: 'Payslip August 2026', firstOpenedAt: null,
        type: { label: 'Payslip' },
      });
    });

    it('mints a link and names the file something a person recognises', async () => {
      const res = await service.getDownloadUrl({
        actor: { ...issuer, userId: 'mike' }, documentId: 'doc1',
      });
      expect(res.url).toContain('org1/documents/ab/abc.pdf');
      // Case is preserved — the title is what a person recognises. Only the
      // extension test is case-insensitive, so "Report.PDF" is not re-suffixed.
      expect(res.fileName).toBe('Payslip August 2026.pdf');
    });

    it('records the open, and stamps firstOpenedAt for the member', async () => {
      await service.getDownloadUrl({ actor: { ...issuer, userId: 'mike' }, documentId: 'doc1' });
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ firstOpenedAt: expect.any(Date) }) }),
      );
      expect(prisma.documentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'OPENED' }) }),
      );
    });

    it('does not re-stamp firstOpenedAt on a second read', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc1', userId: 'mike', organizationId: 'org1',
        storageKey: 'k', mimeType: 'application/pdf', title: 'Payslip',
        firstOpenedAt: new Date('2026-08-01'), type: { label: 'Payslip' },
      });
      await service.getDownloadUrl({ actor: { ...issuer, userId: 'mike' }, documentId: 'doc1' });
      // Overwriting it would lose the one fact delivery evidence needs.
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentEvent.create).toHaveBeenCalled(); // the read is still recorded
    });

    it('does not stamp firstOpenedAt when an ADMIN reads it', async () => {
      await service.getDownloadUrl({ actor: issuer, documentId: 'doc1' });
      // "The member has seen it" must mean the member, not their employer.
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'OPENED', actorId: 'admin1' }) }),
      );
    });

    it('carries request provenance onto the trail', async () => {
      await service.getDownloadUrl({
        actor: { ...issuer, userId: 'mike' },
        documentId: 'doc1',
        ctx: { ip: '84.115.20.11', userAgent: 'HBCField/1.0.2', appVersion: '1.0.2' },
      });
      expect(prisma.documentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ip: '84.115.20.11',
            userAgent: 'HBCField/1.0.2',
            appVersion: '1.0.2',
          }),
        }),
      );
    });
  });
});
