import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { sha256 } from '@hbcfield/shared/storage';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, CONSENT_TEXT, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';
import { renderContractPdf } from '../contract-pdf';

/**
 * Signing.
 *
 * The most exacting part of the feature, so these assertions are mostly about
 * what must NOT happen: nobody signs for anybody else, nothing signs twice, and
 * nothing gets signed after it has been altered.
 */
describe('DocumentsService — signing', () => {
  let service: DocumentsService;
  let objects: Map<string, Buffer>;

  const store = {
    presignUpload: jest.fn(),
    presignDownload: jest.fn(async (k: string) => `https://example.invalid/${k}`),
    put: jest.fn(async (key: string, body: Buffer) => { objects.set(key, body); }),
    get: jest.fn(async (key: string) => {
      const o = objects.get(key);
      if (!o) throw new Error(`no such object ${key}`);
      return o;
    }),
    head: jest.fn(async () => ({ exists: true, sizeBytes: 1, contentType: 'application/pdf' })),
    delete: jest.fn(async () => true),
  };

  const prisma: Record<string, any> = {
    document: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    documentSignature: { findUnique: jest.fn(), create: jest.fn() },
    documentEvent: { create: jest.fn(), count: jest.fn() },
    // The signing chain. Empty by default: these tests are about a document
    // with NO route, which is what every one issued before Phase 2 has.
    documentSigner: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    documentTemplate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    documentType: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const monika: DocumentActor = {
    userId: 'u-monika',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
  };

  /** A real 1×1 PNG data URL — the smallest thing the decoder will accept. */
  const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  // Padded so it clears the 100-byte "is this really an image" floor.
  const SIGNATURE = `data:image/png;base64,${Buffer.concat([
    PNG_BYTES,
    Buffer.alloc(200, 0),
  ]).toString('base64')}`;

  let contractBytes: Buffer;
  let contractHash: string;

  const awaitingDoc = (over: Record<string, unknown> = {}) => ({
    id: 'doc1',
    organizationId: 'org1',
    userId: 'u-monika',
    title: 'Dienstvertrag',
    status: 'AWAITING_SIGNATURE',
    storageKey: 'org1/documents/ab/contract.pdf',
    sha256: contractHash,
    type: { label: 'Employment contract', signatureMode: 'IN_APP' },
    user: { id: 'u-monika', firstName: 'Monika', lastName: 'Holub', email: 'monika@example.com' },
    organization: { name: 'HBC Group GmbH' },
    ...over,
  });

  beforeAll(async () => {
    contractBytes = await renderContractPdf({
      title: 'Dienstvertrag',
      body: '§1 Position\n\nEngaged as Field Technician from 01.09.2026.',
      issuedAt: new Date('2026-08-29T09:00:00Z'),
      organizationName: 'HBC Group GmbH',
      memberName: 'Monika Holub',
    });
    contractHash = sha256(contractBytes);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    objects = new Map([['org1/documents/ab/contract.pdf', contractBytes]]);
    prisma.documentSignature.findUnique.mockResolvedValue(null);
    prisma.document.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));

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

  const sign = (over: Record<string, unknown> = {}) =>
    service.signDocument({
      actor: monika,
      documentId: 'doc1',
      signatureImage: SIGNATURE,
      idempotencyKey: 'attempt-0000001',
      ...over,
    });

  // ── Who may sign ──────────────────────────────────────────────────────────

  describe('nobody signs for anybody else', () => {
    it('scopes the lookup to the authenticated user, not just the organization', async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(sign()).rejects.toBeInstanceOf(NotFoundException);

      const where = prisma.document.findFirst.mock.calls[0][0].where;
      // A colleague's document is NOT FOUND rather than found-and-refused —
      // there is no branch anywhere that could be widened into a delegation.
      expect(where.userId).toBe('u-monika');
      expect(where.organizationId).toBe('org1');
    });

    it('ignores every permission flag — none of them grant signing', async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      const superuser: DocumentActor = {
        ...monika,
        canViewMemberDocuments: true,
        canOpenMemberDocuments: true,
        canIssueDocuments: true,
        canManageDocumentTemplates: true,
      };
      await expect(sign({ actor: superuser })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.document.findFirst.mock.calls[0][0].where.userId).toBe('u-monika');
    });
  });

  // ── State ─────────────────────────────────────────────────────────────────

  describe('what can be signed', () => {
    it('refuses a document that is already signed', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc({ status: 'SIGNED' }));
      await expect(sign()).rejects.toThrow(/already been signed/i);
    });

    it('refuses a document that is not waiting for one', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc({ status: 'ISSUED' }));
      await expect(sign()).rejects.toThrow(/not waiting/i);
    });

    it('REFUSES a WET_INK document outright', async () => {
      // The law excludes some contract types from electronic form. Producing
      // something that looks signed and is not would be worse than not offering.
      prisma.document.findFirst.mockResolvedValue(
        awaitingDoc({ type: { label: 'Fixed-term contract', signatureMode: 'WET_INK' } }),
      );
      await expect(sign()).rejects.toThrow(/on paper/i);
      expect(store.put).not.toHaveBeenCalled();
    });

    it('refuses to draw a signature on an acknowledge-only document', async () => {
      prisma.document.findFirst.mockResolvedValue(
        awaitingDoc({ type: { label: 'Safety policy', signatureMode: 'ACKNOWLEDGE' } }),
      );
      await expect(sign()).rejects.toThrow(/does not take a signature/i);
    });
  });

  // ── Integrity ─────────────────────────────────────────────────────────────

  describe('integrity', () => {
    it('refuses to sign a document whose bytes no longer match its hash', async () => {
      // The one check that makes the whole chain worth having: if the stored
      // object was swapped, a signature must not be attached to it.
      objects.set('org1/documents/ab/contract.pdf', Buffer.from('%PDF-1.4 not the contract'));
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await expect(sign()).rejects.toThrow(/has changed since it was issued/i);
      expect(prisma.documentSignature.create).not.toHaveBeenCalled();
    });

    it('records the before-hash it computed, not the one on the row', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await sign();
      const written = prisma.documentSignature.create.mock.calls[0][0].data;
      expect(written.hashBefore).toBe(contractHash);
      expect(store.get).toHaveBeenCalledWith('org1/documents/ab/contract.pdf');
    });

    it('records an after-hash that differs, and repoints the document at it', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await sign();
      const sig = prisma.documentSignature.create.mock.calls[0][0].data;
      expect(sig.hashAfter).not.toBe(sig.hashBefore);

      const update = prisma.document.update.mock.calls[0][0].data;
      expect(update.sha256).toBe(sig.hashAfter);
      expect(update.status).toBe('SIGNED');
      // Content-addressed, so the new key IS the new hash.
      expect(update.storageKey).toContain(sig.hashAfter);
    });

    it('keeps the unsigned original, which is what the before-hash describes', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await sign();
      expect(objects.has('org1/documents/ab/contract.pdf')).toBe(true);
      expect(store.delete).not.toHaveBeenCalled();
    });

    it('stores the signature image as an object, never inline', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await sign();
      const sig = prisma.documentSignature.create.mock.calls[0][0].data;
      expect(sig.signatureKey).toMatch(/^org1\/signatures\//);
      expect(sig.signatureSha256).toHaveLength(64);
      // Three columns in this schema already hold base64 PNGs. Not a fourth.
      expect(JSON.stringify(sig)).not.toContain('data:image');
    });
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('returns the existing seal on a retry, without signing again', async () => {
      prisma.documentSignature.findUnique.mockResolvedValue({
        documentId: 'doc1',
        sealedAt: new Date('2026-08-29T11:20:04Z'),
        document: { id: 'doc1', organizationId: 'org1', status: 'SIGNED' },
      });
      const res = await sign();
      expect(res.alreadySigned).toBe(true);
      // A dropped connection in a plant room must not produce two signatures.
      expect(prisma.documentSignature.create).not.toHaveBeenCalled();
      expect(store.put).not.toHaveBeenCalled();
    });

    it('answers the retry before touching storage at all', async () => {
      prisma.documentSignature.findUnique.mockResolvedValue({
        documentId: 'doc1',
        sealedAt: new Date(),
        document: { id: 'doc1', organizationId: 'org1', status: 'SIGNED' },
      });
      await sign();
      expect(store.get).not.toHaveBeenCalled();
    });

    it('refuses a key belonging to another organization', async () => {
      prisma.documentSignature.findUnique.mockResolvedValue({
        documentId: 'other',
        sealedAt: new Date(),
        document: { id: 'other', organizationId: 'org-other', status: 'SIGNED' },
      });
      await expect(sign()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a key long enough to actually be unique', async () => {
      await expect(sign({ idempotencyKey: 'x' })).rejects.toThrow(/idempotency key/i);
    });
  });

  // ── The signature image ───────────────────────────────────────────────────

  describe('the signature image', () => {
    beforeEach(() => prisma.document.findFirst.mockResolvedValue(awaitingDoc()));

    it('rejects anything that is not a PNG data URL', async () => {
      await expect(sign({ signatureImage: 'not-an-image' })).rejects.toThrow(/could not be read/i);
      await expect(
        sign({ signatureImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }),
      ).rejects.toThrow(/could not be read/i);
    });

    it('rejects base64 that decodes to something without a PNG header', async () => {
      // A file-type claim in a data URL is just a string; the bytes decide.
      const fake = `data:image/png;base64,${Buffer.alloc(300, 0x41).toString('base64')}`;
      await expect(sign({ signatureImage: fake })).rejects.toThrow(/could not be read/i);
    });

    it('rejects an image far larger than a drawn signature', async () => {
      const huge = Buffer.concat([PNG_BYTES, Buffer.alloc(3 * 1024 * 1024, 0)]);
      await expect(
        sign({ signatureImage: `data:image/png;base64,${huge.toString('base64')}` }),
      ).rejects.toThrow(/too large/i);
    });
  });

  // ── The trail ─────────────────────────────────────────────────────────────

  describe('the evidence trail', () => {
    it('writes the trail in the same transaction as the update', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      prisma.documentEvent.count.mockResolvedValue(0);
      await sign();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const types = prisma.documentEvent.create.mock.calls.map((c: any[]) => c[0].data.type);
      expect(types).toEqual(['CONSENTED', 'SIGNED', 'SEALED']);
    });

    it('adds CONSENTED itself when the client skipped that call', async () => {
      // Both clients walk the flow properly — but a complete legal record must
      // not depend on a client having made an extra request.
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      prisma.documentEvent.count.mockResolvedValue(0);
      await sign();
      const consent = prisma.documentEvent.create.mock.calls
        .map((c: any[]) => c[0].data)
        .find((d: any) => d.type === 'CONSENTED');
      expect(consent.meta).toEqual({ text: CONSENT_TEXT });
    });

    it('does NOT duplicate CONSENTED when the client already recorded it', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      prisma.documentEvent.count.mockResolvedValue(1);
      await sign();
      const types = prisma.documentEvent.create.mock.calls.map((c: any[]) => c[0].data.type);
      expect(types).toEqual(['SIGNED', 'SEALED']);
    });

    it('stores the exact consent wording that was shown', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await sign();
      // Verbatim, so a later change to the wording leaves past signatures
      // carrying the words the signer actually saw.
      expect(prisma.documentSignature.create.mock.calls[0][0].data.consentText).toBe(CONSENT_TEXT);
    });

    it('records consent as its own act, before any signature', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      const res = await service.recordConsent({ actor: monika, documentId: 'doc1' });
      expect(res.consentText).toBe(CONSENT_TEXT);
      expect(prisma.documentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CONSENTED' }) }),
      );
    });

    it('carries device and location onto the signature', async () => {
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await sign({
        ctx: { ip: '84.115.20.11', userAgent: 'HBCField/1.0.2', appVersion: '1.0.2', lat: 47.98, lng: 13.82 },
      });
      const events = prisma.documentEvent.create.mock.calls.map((c: any[]) => c[0].data);
      expect(events[0]).toMatchObject({ ip: '84.115.20.11', lat: 47.98, lng: 13.82 });
    });
  });

  // ── Acknowledgement ───────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('accepts an acknowledge-only document and records receipt', async () => {
      prisma.document.findFirst.mockResolvedValue(
        awaitingDoc({ type: { label: 'Safety policy', signatureMode: 'ACKNOWLEDGE' } }),
      );
      await expect(
        service.acknowledgeDocument({ actor: monika, documentId: 'doc1' }),
      ).resolves.toEqual({ success: true });
      expect(prisma.documentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'ACKNOWLEDGED' }) }),
      );
    });

    it('refuses to stand in for a real signature', async () => {
      // Acknowledgement is receipt, not agreement. Letting it clear a contract
      // would quietly downgrade every signature in the system.
      prisma.document.findFirst.mockResolvedValue(awaitingDoc());
      await expect(
        service.acknowledgeDocument({ actor: monika, documentId: 'doc1' }),
      ).rejects.toThrow(/needs a signature/i);
    });

    it('does not seal or produce a certificate', async () => {
      prisma.document.findFirst.mockResolvedValue(
        awaitingDoc({ type: { label: 'Safety policy', signatureMode: 'ACKNOWLEDGE' } }),
      );
      await service.acknowledgeDocument({ actor: monika, documentId: 'doc1' });
      expect(prisma.documentSignature.create).not.toHaveBeenCalled();
      expect(store.put).not.toHaveBeenCalled();
    });
  });
});

describe('DocumentsService — template resolution', () => {
  let service: DocumentsService;
  const prisma: Record<string, any> = {
    documentTemplate: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    documentType: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    document: {}, documentEvent: {}, documentSignature: {},
    documentSigner: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };

  const manager: DocumentActor = {
    userId: 'admin', organizationId: 'org1',
    canViewMemberDocuments: true, canOpenMemberDocuments: true,
    canIssueDocuments: true, canManageDocumentTemplates: true,
  };

  const tpl = (over: Record<string, unknown>) => ({
    id: 'x', appliesToRoleId: null, appliesToPosition: null,
    type: { id: 't', label: 'Contract', retentionMonths: null }, ...over,
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
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('prefers a template matching BOTH role and job title', async () => {
    prisma.documentTemplate.findMany.mockResolvedValue([
      tpl({ id: 'default' }),
      tpl({ id: 'role', appliesToRoleId: 'r1' }),
      tpl({ id: 'both', appliesToRoleId: 'r1', appliesToPosition: 'Field Technician' }),
    ]);
    const t = await service.resolveTemplate({
      organizationId: 'org1', roleId: 'r1', position: 'Field Technician',
    });
    expect(t?.id).toBe('both');
  });

  it('falls back through role, then position, then the default', async () => {
    prisma.documentTemplate.findMany.mockResolvedValue([
      tpl({ id: 'default' }),
      tpl({ id: 'role', appliesToRoleId: 'r1' }),
    ]);
    expect((await service.resolveTemplate({ organizationId: 'org1', roleId: 'r1' }))?.id).toBe('role');
    expect((await service.resolveTemplate({ organizationId: 'org1', roleId: 'r-other' }))?.id).toBe('default');
  });

  it('never uses a template bound to a DIFFERENT role as a fallback', async () => {
    // A template naming a role is a template for that role, not a default.
    prisma.documentTemplate.findMany.mockResolvedValue([tpl({ id: 'role', appliesToRoleId: 'r1' })]);
    expect(await service.resolveTemplate({ organizationId: 'org1', roleId: 'r-other' })).toBeNull();
  });

  it('matches a job title case- and whitespace-insensitively', async () => {
    prisma.documentTemplate.findMany.mockResolvedValue([
      tpl({ id: 'pos', appliesToPosition: '  field technician ' }),
    ]);
    const t = await service.resolveTemplate({ organizationId: 'org1', position: 'Field Technician' });
    expect(t?.id).toBe('pos');
  });

  it('returns null when the organization has no templates', async () => {
    prisma.documentTemplate.findMany.mockResolvedValue([]);
    expect(await service.resolveTemplate({ organizationId: 'org1' })).toBeNull();
  });

  describe('template validation', () => {
    beforeEach(() => prisma.documentType.findFirst.mockResolvedValue({ id: 't', organizationId: 'org1' }));

    it('refuses a body referring to a field that does not exist', async () => {
      // Caught when SAVED, not when issued — the author can fix a typo now,
      // whereas the same error during onboarding blocks somebody's first day.
      await expect(
        service.createTemplate({
          actor: manager, typeId: 't', name: 'T',
          body: 'Pay {{member.iban}} monthly.',
        }),
      ).rejects.toThrow(/do not exist/i);
    });

    it('refuses an empty body', async () => {
      await expect(
        service.createTemplate({ actor: manager, typeId: 't', name: 'T', body: '   ' }),
      ).rejects.toThrow(/needs a body/i);
    });

    it('accepts a body using only real fields', async () => {
      prisma.documentTemplate.create.mockResolvedValue({ id: 'new' });
      await expect(
        service.createTemplate({
          actor: manager, typeId: 't', name: 'T',
          body: '{{member.fullName}} starts {{contract.startDate}} at {{org.legalName}}.',
        }),
      ).resolves.toMatchObject({ id: 'new' });
    });

    it('bumps the version when the body changes, leaving issued documents alone', async () => {
      prisma.documentTemplate.findFirst.mockResolvedValue({ id: 'x', version: 3 });
      prisma.documentTemplate.update.mockResolvedValue({});
      await service.updateTemplate({
        actor: manager, id: 'x', patch: { body: '{{member.fullName}}' },
      });
      expect(prisma.documentTemplate.update.mock.calls[0][0].data.version).toBe(4);
    });

    it('does not bump the version for a rename', async () => {
      prisma.documentTemplate.findFirst.mockResolvedValue({ id: 'x', version: 3 });
      prisma.documentTemplate.update.mockResolvedValue({});
      await service.updateTemplate({ actor: manager, id: 'x', patch: { name: 'New name' } });
      expect(prisma.documentTemplate.update.mock.calls[0][0].data.version).toBeUndefined();
    });
  });
});
