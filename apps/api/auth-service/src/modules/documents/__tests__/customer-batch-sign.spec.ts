import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';
import { sha256 } from '@hbcfield/shared/storage';

/*
  The tamper gate is real here, not stubbed.

  It re-hashes the bytes it just read and refuses if they differ from what was
  stored — the check that stops a signature being attached to an object swapped
  underneath us. Faking it would leave the one guarantee this whole feature
  rests on untested, so the fixture stores the true digest of the fake bytes.
*/
let BYTES: Buffer;
let TRUE_HASH: string;

beforeAll(async () => {
  // A real (empty) PDF, because the seal really parses it. Fake bytes would
  // exercise everything except the step this feature exists to perform.
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  BYTES = Buffer.from(await doc.save());
  TRUE_HASH = sha256(BYTES);
});

/**
 * A client signing several documents in one sitting.
 *
 * One ceremony, many signatures — and the distinction is the whole test. What
 * is shared is the act: the drawing, the consent, the moment. What is NOT
 * shared is anything that makes a signature evidence, because a document whose
 * proof depended on the others it happened to be batched with would be worth
 * less than one signed alone.
 */
describe('DocumentsService — a client signing a batch', () => {
  let service: DocumentsService;

  /*
    The same real 1×1 PNG the existing signing specs use, padded to clear the
    decoder's 100-byte floor. It has to be a genuine PNG: the seal embeds it in
    the PDF, so header-shaped bytes get as far as the renderer and fail there.
  */
  const PNG = `data:image/png;base64,${Buffer.concat([
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
    Buffer.alloc(200, 0),
  ]).toString('base64')}`;

  const store = {
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(async () => BYTES),
    presignDownload: jest.fn().mockResolvedValue('https://example/x'),
  };

  const signerRow = (id: string, docId: string, title: string) => ({
    id,
    order: 3,
    status: 'PENDING',
    openedAt: null,
    document: {
      id: docId,
      title,
      periodYear: 2026,
      periodMonth: 9,
      user: { firstName: 'Ahmed', lastName: 'Desssouky' },
      signers: [
        { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'worker', customerId: null, signedAt: new Date() },
        { order: 2, role: 'RESPONSIBLE', status: 'SIGNED', userId: 'anna', customerId: null, signedAt: new Date() },
        { order: 3, role: 'CUSTOMER', status: 'PENDING', userId: null, customerId: 'cust1', signedAt: null },
      ],
      signatures: [],
    },
  });

  const prisma: Record<string, any> = {
    documentSigner: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    document: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    documentSignature: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), updateMany: jest.fn() },
    documentEvent: { create: jest.fn(), count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const base = {
    organizationId: 'org1',
    customerId: 'cust1',
    customerEmail: 'office@binderholz.com',
    signatureImage: PNG,
    typedName: 'Maria Binder',
    idempotencyKey: 'ceremony-abc12345',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.documentSignature.findMany.mockResolvedValue([]);
    prisma.documentEvent.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.document.findFirst.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      title: 'Time Sheets September 2026',
      storageKey: `key-${where.id}`,
      sha256: TRUE_HASH,
      originalKey: null,
      organization: { name: 'HBC USA Inc.' },
    }));

    const mod = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn(), send: jest.fn() } },
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = mod.get(DocumentsService);
  });

  /*
    Two different questions reach `documentSigner.findMany`.

    The client's LIST asks for rows with their document attached; the chain read
    inside signing asks for flat steps. One mock answering both with the same
    shape would leave every step looking like it belonged to nobody — which is
    exactly what a real query would never do, so the mock discriminates the way
    the selects do.
  */
  const CHAIN = [
    { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'worker', customerId: null, signedAt: new Date() },
    { order: 2, role: 'RESPONSIBLE', status: 'SIGNED', userId: 'anna', customerId: null, signedAt: new Date() },
    { order: 3, role: 'CUSTOMER', status: 'PENDING', userId: null, customerId: 'cust1', signedAt: null },
  ];

  const threeWaiting = () =>
    prisma.documentSigner.findMany.mockImplementation(async (args: any) =>
      args?.select?.document
        ? [
            signerRow('s1', 'd1', 'Time Sheets September 2026'),
            signerRow('s2', 'd2', 'Time Sheets September 2026'),
            signerRow('s3', 'd3', 'Time Sheets September 2026'),
          ]
        : CHAIN,
    );

  describe('what it refuses', () => {
    it('refuses without a name — it is the only identity this signature has', async () => {
      threeWaiting();
      await expect(service.signBatchAsCustomer({ ...base, typedName: ' ', signerIds: ['s1'] }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an empty selection', async () => {
      threeWaiting();
      await expect(service.signBatchAsCustomer({ ...base, signerIds: [] }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a batch beyond the cap', async () => {
      // Each signature is a PDF re-render; an unbounded batch is an unbounded
      // request, and one client could hold a worker busy indefinitely.
      threeWaiting();
      await expect(
        service.signBatchAsCustomer({ ...base, signerIds: Array.from({ length: 51 }, (_, i) => `s${i}`) }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses documents that have left the queue since the page was drawn', async () => {
      threeWaiting();
      await expect(service.signBatchAsCustomer({ ...base, signerIds: ['not-mine'] }))
        .rejects.toThrow(/no longer waiting/i);
    });
  });

  describe('signing several at once', () => {
    it('signs each document separately, with its own signature row', async () => {
      threeWaiting();
      const res = await service.signBatchAsCustomer({ ...base, signerIds: ['s1', 's2', 's3'] });

      expect(res.signed).toBe(3);
      expect(prisma.documentSignature.create).toHaveBeenCalledTimes(3);
    });

    it('stores the drawing ONCE, however many documents it covers', async () => {
      /*
        Keys are content-addressed, so one drawing is one object whatever it is
        applied to. Uploading it per document would be three writes of identical
        bytes to the same key.
      */
      threeWaiting();
      await service.signBatchAsCustomer({ ...base, signerIds: ['s1', 's2', 's3'] });

      const pngPuts = store.put.mock.calls.filter((c: any[]) => c[2] === 'image/png');
      expect(pngPuts).toHaveLength(1);
    });

    it('gives every document its own idempotency key', async () => {
      /*
        One key across the batch would hand every document after the first the
        FIRST one's cached result — a batch that silently signs one document and
        reports eleven.
      */
      threeWaiting();
      await service.signBatchAsCustomer({ ...base, signerIds: ['s1', 's2', 's3'] });

      const keys = prisma.documentSignature.create.mock.calls.map((c: any[]) => c[0].data.idempotencyKey);
      expect(new Set(keys).size).toBe(3);
      keys.forEach((k: string) => expect(k.startsWith('ceremony-abc12345:')).toBe(true));
    });

    it('records the ceremony on each signature, so the certificate can say so', async () => {
      // A document signed among eleven is weaker evidence than one signed
      // alone, and the certificate is the wrong place to be tactful about it.
      threeWaiting();
      await service.signBatchAsCustomer({ ...base, signerIds: ['s1', 's2'] });

      const batchIds = prisma.documentSignature.create.mock.calls.map((c: any[]) => c[0].data.batchId);
      expect(batchIds).toEqual(['ceremony-abc12345', 'ceremony-abc12345']);
    });

    it('writes the client, not a user, and keeps the name they typed', async () => {
      threeWaiting();
      await service.signBatchAsCustomer({ ...base, signerIds: ['s1'], typedRole: ' Site Manager ' });

      const row = prisma.documentSignature.create.mock.calls[0][0].data;
      expect(row.userId).toBeNull();
      expect(row.customerId).toBe('cust1');
      expect(row.signerName).toBe('Maria Binder');
      expect(row.signerRole).toBe('Site Manager');
    });

    it('keeps the signatures it managed when one document fails', async () => {
      /*
        Each seal is its own transaction, so two successes are two real
        signatures whatever happens to the third. Throwing would tell the client
        none of it took when most of it did — and they cannot retry only the
        part that failed, because they cannot see which part that was.
      */
      threeWaiting();
      let n = 0;
      prisma.document.findFirst.mockImplementation(async ({ where }: any) => {
        n += 1;
        if (n === 2) throw new Error('storage unavailable');
        return {
          id: where.id, title: 'Time Sheets', storageKey: `key-${where.id}`,
          sha256: TRUE_HASH, originalKey: null, organization: { name: 'HBC USA Inc.' },
        };
      });

      const res = await service.signBatchAsCustomer({ ...base, signerIds: ['s1', 's2', 's3'] });
      expect(res.signed).toBe(2);
      expect(res.failed).toHaveLength(1);
    });
  });
});
