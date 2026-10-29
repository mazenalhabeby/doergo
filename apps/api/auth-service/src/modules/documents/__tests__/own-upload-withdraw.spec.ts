import { ForbiddenException } from '@nestjs/common';
import { withdrawOwnDocument } from '../issuing/own-document-withdraw';
import { type DocumentActor } from '../core/document-common';

/*
  A member withdrawing their own upload.

  It could delete a licence the office had already verified (now the
  organization's record), or one the office had hidden from them; it left no
  trace once the row (and its trail) was gone; and the stored file stayed
  behind forever. Now: only while it waits for review or after it was refused,
  witnessed in the activity log, and the file is freed with the row.
*/
describe('withdrawing your own upload', () => {
  const me: DocumentActor = {
    userId: 'mike',
    organizationId: 'org1',
    canViewMemberDocuments: false,
    canOpenMemberDocuments: false,
    canIssueDocuments: false,
    canManageDocumentTemplates: false,
  };
  const row = (status: string) => ({
    id: 'd1',
    title: 'Driving licence',
    status,
    issuedById: null,
    storageKey: 'org1/documents/aa.jpg',
    originalKey: 'org1/documents/aa.jpg',
    type: { direction: 'SUPPLIED', label: 'Driving licence' },
  });
  const prisma: any = {
    document: { findFirst: jest.fn(), deleteMany: jest.fn(async () => ({ count: 1 })) },
    activityLog: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const storage: any = { freeStorageIfUnreferenced: jest.fn() };
  const withdraw = () => withdrawOwnDocument(prisma, storage, { actor: me, documentId: 'd1' });

  beforeEach(() => jest.clearAllMocks());

  it('refuses once the office verified it', async () => {
    prisma.document.findFirst.mockResolvedValue(row('ISSUED'));
    const err = await withdraw().catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'OWN_DOCUMENT_ALREADY_ACCEPTED' });
    expect(prisma.document.deleteMany).not.toHaveBeenCalled();
  });

  it('never reaches a document the office hid from the member', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    await expect(withdraw()).rejects.toThrow(/not found/i);
    expect(prisma.document.findFirst.mock.calls[0][0].where.hiddenFromMember).toBe(false);
  });

  it('a pending upload goes: witnessed in the activity log, its file freed', async () => {
    prisma.document.findFirst.mockResolvedValue(row('PENDING_VERIFICATION'));
    await expect(withdraw()).resolves.toEqual({ success: true });
    expect(prisma.activityLog.create.mock.calls[0][0].data).toMatchObject({
      eventType: 'DOCUMENT_DELETED',
      userId: 'mike',
      resourceId: 'd1',
      metadata: { ownUpload: true, previousStatus: 'PENDING_VERIFICATION' },
    });
    expect(prisma.document.deleteMany.mock.calls[0][0].where.status).toEqual({
      in: ['PENDING_VERIFICATION', 'REJECTED'],
    });
    expect(storage.freeStorageIfUnreferenced).toHaveBeenCalledWith('org1/documents/aa.jpg');
  });

  it('a review landing at the same moment wins: nothing deleted, refused', async () => {
    prisma.document.findFirst.mockResolvedValue(row('PENDING_VERIFICATION'));
    prisma.document.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(withdraw()).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.freeStorageIfUnreferenced).not.toHaveBeenCalled();
  });
});
