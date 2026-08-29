import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * A member supplying their own document.
 *
 * Only an administrator could file anything, so a driving licence — a document
 * only its holder possesses — had to be emailed to the office and uploaded by
 * somebody else. That does not scale and the data is stale within a month.
 *
 * Opening a write path to every member in the organization is the part worth
 * being careful about, and these are the four things that keep it safe:
 *
 *   1. The member is the TOKEN. No request shape files into another record.
 *   2. SUPPLIED types only. Nobody files themselves a payslip.
 *   3. PENDING_VERIFICATION, never ISSUED. An unreviewed upload cannot clear a
 *      credential requirement, because the dispatch gate reads status.
 *   4. Their own staging folder. A member cannot confirm an object somebody
 *      else uploaded, even knowing its key.
 */
describe('DocumentsService — what the member supplies', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    documentType: { findFirst: jest.fn() },
    document: { create: jest.fn(), findFirst: jest.fn() },
    documentEvent: { create: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const store = {
    presignUpload: jest.fn(),
    head: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };

  const notifications = { emit: jest.fn() };

  /** A member with NO document permission at all — the normal case. */
  const actor = (over: Partial<DocumentActor> = {}): DocumentActor => ({
    userId: 'member1',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
    ...over,
  });

  const LICENCE = {
    id: 'type-licence',
    organizationId: 'org1',
    label: 'Driving licence',
    direction: 'SUPPLIED',
    isActive: true,
    hasExpiry: true,
    isCredential: true,
    cadence: 'ONE_OFF',
    signatureMode: 'NONE',
    retentionMonths: 36,
  };
  const PAYSLIP = { ...LICENCE, id: 'type-payslip', label: 'Payslip', direction: 'ISSUED', hasExpiry: false, isCredential: false };

  const MEMBER = { id: 'member1', firstName: 'Lisa', lastName: 'Adler', email: 'lisa@example.com' };
  const OWN_KEY = 'org1/documents/_staging/u/member1/abc123.jpg';
  const BYTES = Buffer.from('a photograph of a driving licence');

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notifications },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);

    prisma.user.findFirst.mockResolvedValue(MEMBER);
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        document: { create: prisma.document.create },
        documentEvent: { create: prisma.documentEvent.create },
      }),
    );
    prisma.document.create.mockImplementation(({ data }: any) => ({ id: 'doc1', ...data }));
    store.head.mockResolvedValue({ exists: true, sizeBytes: BYTES.length, contentType: 'image/jpeg' });
    store.get.mockResolvedValue(BYTES);
    store.presignUpload.mockImplementation((key: string) => ({ url: 'https://s3/put', key }));
  });

  // ── Getting somewhere to upload to ────────────────────────────────────────

  describe('presignOwnUpload', () => {
    it('needs NO permission — it is your own document', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(
        service.presignOwnUpload({ actor: actor(), typeId: LICENCE.id, mimeType: 'image/jpeg', sizeBytes: 1000 }),
      ).resolves.toBeTruthy();
    });

    it('stages into a folder of the member’s own', async () => {
      /*
        Per-user, not per-organization. The administrator's staging prefix is
        shared by everyone who can issue — fine, because they may file to
        anybody. A member may file only to themselves, so their confirm step has
        to be unable to name an object somebody else staged.
      */
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await service.presignOwnUpload({ actor: actor(), typeId: LICENCE.id, mimeType: 'image/jpeg', sizeBytes: 1000 });
      expect(store.presignUpload.mock.calls[0][0]).toMatch(
        /^org1\/documents\/_staging\/u\/member1\/[a-z0-9]+\.jpg$/,
      );
    });

    it('refuses a type the organization issues', async () => {
      // Otherwise "upload your own document" is a way to file yourself a payslip.
      prisma.documentType.findFirst.mockResolvedValue(PAYSLIP);
      await expect(
        service.presignOwnUpload({ actor: actor(), typeId: PAYSLIP.id, mimeType: 'image/jpeg', sizeBytes: 1000 }),
      ).rejects.toThrow(ForbiddenException);
      expect(store.presignUpload).not.toHaveBeenCalled();
    });

    it('refuses a retired type', async () => {
      prisma.documentType.findFirst.mockResolvedValue({ ...LICENCE, isActive: false });
      await expect(
        service.presignOwnUpload({ actor: actor(), typeId: LICENCE.id, mimeType: 'image/jpeg', sizeBytes: 1000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a type belonging to another organization', async () => {
      prisma.documentType.findFirst.mockResolvedValue(null);
      await expect(
        service.presignOwnUpload({ actor: actor(), typeId: 'someone-elses', mimeType: 'image/jpeg', sizeBytes: 1000 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('applies the same file rules the administrator’s path does', async () => {
      // A limit only one path honours is not a limit.
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(
        service.presignOwnUpload({ actor: actor(), typeId: LICENCE.id, mimeType: 'application/zip', sizeBytes: 1000 }),
      ).rejects.toThrow(/cannot be filed/i);
      await expect(
        service.presignOwnUpload({ actor: actor(), typeId: LICENCE.id, mimeType: 'image/jpeg', sizeBytes: 99_000_000 }),
      ).rejects.toThrow(/larger than/i);
      await expect(
        service.presignOwnUpload({ actor: actor(), typeId: LICENCE.id, mimeType: 'image/jpeg', sizeBytes: 0 }),
      ).rejects.toThrow(/file size/i);
    });
  });

  // ── Filing it ─────────────────────────────────────────────────────────────

  describe('submitOwnDocument', () => {
    const submit = (over: Record<string, unknown> = {}) =>
      service.submitOwnDocument({
        actor: actor(),
        stagingKey: OWN_KEY,
        typeId: LICENCE.id,
        expiresOn: '2030-01-31',
        ...over,
      } as any);

    it('files it as PENDING_VERIFICATION, never ISSUED', async () => {
      /*
        THE property this whole step rests on. A photograph somebody took of a
        card they say is theirs is a claim, not a record. The dispatch gate
        selects status IN ('ISSUED','SIGNED'), so this status cannot satisfy a
        credential requirement until a human moves it.
      */
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await submit();
      expect(prisma.document.create.mock.calls[0][0].data.status).toBe('PENDING_VERIFICATION');
    });

    it('records who supplied it, and does not pretend anybody issued it', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await submit();
      const created = prisma.document.create.mock.calls[0][0].data;
      expect(created.userId).toBe('member1');
      expect(created.issuedById).toBeUndefined();
      expect(prisma.documentEvent.create.mock.calls[0][0].data.type).toBe('SUBMITTED');
    });

    it('takes the member from the token, so a body cannot redirect it', async () => {
      // The DTO has no userId at all; this proves the service would ignore one.
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await service.submitOwnDocument({
        actor: actor(),
        stagingKey: OWN_KEY,
        typeId: LICENCE.id,
        expiresOn: '2030-01-31',
        userId: 'somebody-else',
      } as any);
      expect(prisma.document.create.mock.calls[0][0].data.userId).toBe('member1');
    });

    it('refuses a staging key from another member’s folder', async () => {
      /*
        The reason the folder is per-user. Without this, a member who learned a
        colleague's staging key could confirm their colleague's file into their
        OWN record — and staging keys travel through a browser.
      */
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(
        submit({ stagingKey: 'org1/documents/_staging/u/member2/abc123.jpg' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('refuses the administrator’s shared staging folder too', async () => {
      // Where a payslip staged for somebody else would be sitting.
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(
        submit({ stagingKey: 'org1/documents/_staging/payroll.pdf' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a foreign key BEFORE looking anything up', async () => {
      /*
        The ordering, not just the refusal — and this exists because a refactor
        lost it once. Checking the member and the type first would let somebody
        probing staging keys tell a 403 from a 404 and so learn which member ids
        and type ids are real.
      */
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(
        submit({ stagingKey: 'org1/documents/_staging/u/member2/abc123.jpg' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.documentType.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('refuses a key that climbs out of the folder', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(
        submit({ stagingKey: 'org1/documents/_staging/u/member1/../../other.pdf' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses another organization entirely', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(
        submit({ stagingKey: 'org2/documents/_staging/u/member1/abc.jpg' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a type the organization issues', async () => {
      prisma.documentType.findFirst.mockResolvedValue(PAYSLIP);
      await expect(submit({ typeId: PAYSLIP.id })).rejects.toThrow(ForbiddenException);
      expect(store.get).not.toHaveBeenCalled();
    });

    it('demands an expiry date when the type expires', async () => {
      // A certificate with no date can never lapse, so it would sit on the
      // compliance board as permanently valid.
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(submit({ expiresOn: undefined })).rejects.toThrow(/expiry date/i);
    });

    it('accepts an expiry in the past', async () => {
      /*
        Deliberate. Somebody uploading a lapsed licence alongside its
        replacement is doing the right thing, and the board already reads it as
        expired — refusing would only mean the office never sees the lapse.
      */
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(submit({ expiresOn: '2020-01-01' })).resolves.toBeTruthy();
    });

    it('refuses an expiry that is obviously a typo', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(submit({ expiresOn: '2999-01-01' })).rejects.toThrow(/too far/i);
    });

    it('refuses an unreadable date rather than storing an Invalid Date', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await expect(submit({ expiresOn: 'next tuesday' })).rejects.toThrow(/could not be read/i);
    });

    it('hashes the bytes itself rather than trusting the client', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await submit();
      const created = prisma.document.create.mock.calls[0][0].data;
      expect(created.sha256).toHaveLength(64);
      expect(created.sizeBytes).toBe(BYTES.length);
      // Content-addressed: the key is derived from what was actually stored.
      expect(created.storageKey).toContain(created.sha256);
    });

    it('removes the staged object once it is filed', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await submit();
      expect(store.delete).toHaveBeenCalledWith(OWN_KEY);
    });

    it('refuses when the upload never actually arrived', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      store.head.mockResolvedValue({ exists: false });
      await expect(submit()).rejects.toThrow(/did not complete/i);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('deletes an object that is over the limit rather than filing it', async () => {
      // The presign said a size; the object is what actually landed.
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      store.head.mockResolvedValue({ exists: true, sizeBytes: 99_000_000, contentType: 'image/jpeg' });
      await expect(submit()).rejects.toThrow(/larger than/i);
      expect(store.delete).toHaveBeenCalledWith(OWN_KEY);
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('applies the type’s retention, like any other document', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await submit();
      expect(prisma.document.create.mock.calls[0][0].data.retentionUntil).toBeInstanceOf(Date);
    });

    it('titles it after the type when the member gives no title', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await submit({ title: '   ' });
      expect(prisma.document.create.mock.calls[0][0].data.title).toBe('Driving licence');
    });

    it('tells the organization one is waiting, with the member named', async () => {
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      await submit();
      const [event, payload] = notifications.emit.mock.calls[0];
      expect(event).toBe('document_submitted');
      expect(payload).toMatchObject({ organizationId: 'org1', memberId: 'member1', memberName: 'Lisa Adler' });
    });

    it('does not lose the upload when the notification queue is down', async () => {
      // The document is in the review list either way, which is the durable half.
      prisma.documentType.findFirst.mockResolvedValue(LICENCE);
      notifications.emit.mockImplementationOnce(() => { throw new Error('redis down'); });
      await expect(submit()).resolves.toBeTruthy();
    });
  });
});
