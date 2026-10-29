import { ConflictException } from '@nestjs/common';
import { DocumentVerificationService } from '../issuing/document-verification.service';
import { type DocumentActor } from '../core/document-common';

/*
  Two reviewers deciding one upload at the same moment.

  Both read it PENDING_VERIFICATION; the write was unconditional, so one could
  approve it and the other reject it a second later — the member told both. The
  write is conditional on PENDING_VERIFICATION now: one decides, the other 409.
*/
describe('verify / reject are decided once', () => {
  let status: string;
  const prisma: any = {
    document: {
      findFirst: jest.fn(async () => ({
        id: 'doc1',
        userId: 'mike',
        expiresOn: new Date('2030-01-01'),
        user: { id: 'mike', firstName: 'Mike', lastName: 'W', email: 'm@x.at' },
        type: { label: 'Licence', signatureMode: 'NONE', hasExpiry: true },
      })),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.status !== status) return { count: 0 };
        status = data.status;
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => ({ id: 'doc1', status })),
    },
    documentEvent: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const notifier: any = { notifyReviewed: jest.fn() };
  const service = new DocumentVerificationService(prisma, notifier);
  const office: DocumentActor = {
    userId: 'anna',
    organizationId: 'org1',
    isAdmin: true,
    canViewMemberDocuments: true,
    canOpenMemberDocuments: true,
    canIssueDocuments: true,
    canManageDocumentTemplates: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    status = 'PENDING_VERIFICATION';
  });

  it('approve and reject at once: one wins, the other is 409 and the member is told once', async () => {
    const results = await Promise.allSettled([
      service.verifyDocument({ actor: office, documentId: 'doc1' }),
      service.rejectDocument({ actor: { ...office, userId: 'otto' }, documentId: 'doc1', reason: 'Blurred' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ConflictException);
    expect((lost.reason as ConflictException).getResponse()).toMatchObject({ code: 'DOCUMENT_ALREADY_REVIEWED' });
    expect(notifier.notifyReviewed).toHaveBeenCalledTimes(1);
    expect(prisma.documentEvent.create).toHaveBeenCalledTimes(1);
  });
});
