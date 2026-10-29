import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SERVICE_NAMES, PrismaService } from '@hbcfield/shared';
import { sha256 } from '@hbcfield/shared/storage';
import { MrzOcrService } from '../reading/mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { DOCUMENT_SERVICES } from '../document-services';
import { OBJECT_STORE } from '../core/object-store.provider';
import { renderContractPdf } from '../core/contract-pdf';

/*
  Two signatures on ONE step at the same moment.

  Both pass the turn check before either writes. The write must be conditional
  — the step (or, without a route, the document) must still be waiting — so
  exactly one commits and the other is told 409, instead of two signature rows
  and two seals on one step.
*/
describe('two signatures on one step at once', () => {
  let service: DocumentsService;
  let bytes: Buffer;
  const objects = new Map<string, Buffer>();
  const store = {
    put: jest.fn(async (k: string, b: Buffer) => void objects.set(k, b)),
    get: jest.fn(async (k: string) => objects.get(k) as Buffer),
  };

  /** The database: a row is claimed once, the way Postgres serialises two conditional UPDATEs. */
  let stepStatus: string;
  let docStatus: string;
  const prisma: Record<string, any> = {
    document: {
      findFirst: jest.fn(),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.status !== docStatus) return { count: 0 };
        if (data.status) docStatus = data.status;
        return { count: 1 };
      }),
    },
    documentSignature: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    documentEvent: { create: jest.fn(), count: jest.fn().mockResolvedValue(1), findFirst: jest.fn() },
    documentSigner: {
      findMany: jest.fn(),
      findFirst: jest.fn(async () => ({ id: 'step-2' })),
      updateMany: jest.fn(async ({ where }: any) => {
        if (where.status !== stepStatus) return { count: 0 };
        stepStatus = 'SIGNED';
        return { count: 1 };
      }),
    },
    user: {
      findFirst: jest.fn(async () => ({ firstName: 'Anna', lastName: 'M', email: 'anna@x.at' })),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };

  const actor = (userId: string): DocumentActor => ({
    userId,
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
  });
  const SIGNATURE = `data:image/png;base64,${Buffer.concat([
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
    Buffer.alloc(200, 0),
  ]).toString('base64')}`;

  beforeAll(async () => {
    bytes = await renderContractPdf({
      title: 'Time sheet',
      body: 'Hours',
      issuedAt: new Date('2026-09-01T09:00:00Z'),
      organizationName: 'Acme',
      memberName: 'Mike W',
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    objects.clear();
    objects.set('org1/doc.pdf', bytes);
    prisma.documentSignature.findUnique.mockResolvedValue(null);
    prisma.documentSignature.findMany.mockResolvedValue([]);
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc1',
      organizationId: 'org1',
      userId: 'mike',
      title: 'Time sheet',
      status: 'AWAITING_SIGNATURE',
      storageKey: 'org1/doc.pdf',
      sha256: sha256(bytes),
      originalKey: null,
      type: { label: 'Time sheet', signatureMode: 'IN_APP' },
      user: { id: 'mike', firstName: 'Mike', lastName: 'W', email: 'mike@x.at' },
      organization: { name: 'Acme' },
    });
    const module = await Test.createTestingModule({
      providers: [
        ...DOCUMENT_SERVICES,
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  const sign = (who: string, key: string) =>
    service.signDocument({ actor: actor(who), documentId: 'doc1', signatureImage: SIGNATURE, idempotencyKey: key });

  it('a step open to two leaders: one signature wins, the other is 409', async () => {
    stepStatus = 'PENDING';
    docStatus = 'AWAITING_SIGNATURE';
    prisma.documentSigner.findMany.mockResolvedValue([
      { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'mike', eligibleUserIds: ['mike'], customerId: null },
      {
        order: 2,
        role: 'RESPONSIBLE',
        status: 'PENDING',
        userId: null,
        eligibleUserIds: ['anna', 'otto'],
        customerId: null,
      },
    ]);

    const results = await Promise.allSettled([sign('anna', 'anna-key-123'), sign('otto', 'otto-key-123')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ConflictException);
    expect((lost.reason as ConflictException).getResponse()).toMatchObject({ code: 'DOCUMENT_STEP_ALREADY_SIGNED' });
    expect(prisma.documentSignature.create).toHaveBeenCalledTimes(1);
  });

  it('no route: two taps on two devices sign the document once', async () => {
    docStatus = 'AWAITING_SIGNATURE';
    prisma.documentSigner.findMany.mockResolvedValue([]);

    const results = await Promise.allSettled([sign('mike', 'phone-key-123'), sign('mike', 'web-key-1234')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.documentSignature.create).toHaveBeenCalledTimes(1);
  });
});
