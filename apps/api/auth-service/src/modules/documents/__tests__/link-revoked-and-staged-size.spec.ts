import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SERVICE_NAMES } from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService, type DocumentActor } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Two bounds on things a stranger or a member controls.
 *
 * 1. A client's signing link opens only what it LISTS — a document revoked
 *    after the email went out must not mint a download URL.
 * 2. "Read it before I send it" refuses an oversized staged object BEFORE it is
 *    pulled into memory and decoded.
 */
describe('DocumentsService — link file route and staged size', () => {
  let service: DocumentsService;
  const prisma: Record<string, any> = {
    user: { findFirst: jest.fn() },
    documentSigner: { findFirst: jest.fn(), update: jest.fn() },
    documentEvent: { create: jest.fn() },
  };
  const store = { head: jest.fn(), get: jest.fn(), presignDownload: jest.fn().mockResolvedValue('https://signed') };
  const actor = (): DocumentActor => ({
    userId: 'member1', organizationId: 'org1',
    canViewMemberDocuments: false, canOpenMemberDocuments: false, canIssueDocuments: false, canManageDocumentTemplates: false,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: MrzOcrService, useValue: { read: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('asks only for documents the link may show — a revoked one is not found', async () => {
    prisma.documentSigner.findFirst.mockResolvedValue(null); // what the status filter yields for REVOKED
    await expect(
      service.openForCustomer({ organizationId: 'org1', email: 'c@x.com', signerId: 's1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const where = prisma.documentSigner.findFirst.mock.calls[0][0].where;
    expect(where.document.organizationId).toBe('org1');
    expect(where.document.status.in).toEqual(['AWAITING_SIGNATURE', 'SIGNED']);
    expect(where.document.status.in).not.toContain('REVOKED');
    expect(store.presignDownload).not.toHaveBeenCalled();
  });

  it('refuses an oversized staged object without downloading it', async () => {
    store.head.mockResolvedValue({ exists: true, sizeBytes: 26 * 1024 * 1024, contentType: 'image/jpeg' });
    await expect(
      service.readOwnUpload({ actor: actor(), stagingKey: 'org1/documents/_staging/u/member1/big.jpg' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.get).not.toHaveBeenCalled();
  });

  it('refuses one that turns out bigger than its head said', async () => {
    store.head.mockResolvedValue({ exists: true, contentType: 'image/jpeg' });
    store.get.mockResolvedValue(Buffer.alloc(26 * 1024 * 1024));
    await expect(
      service.readOwnUpload({ actor: actor(), stagingKey: 'org1/documents/_staging/u/member1/big.jpg' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
