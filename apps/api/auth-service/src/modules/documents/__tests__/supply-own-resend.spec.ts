/**
 * A document a member supplied offline, sent twice, is filed once — the second
 * send must not fail on the upload the first already moved out of staging.
 */
import { DocumentsService } from '../documents.service';

it('returns the filed document for a resend, before touching staging', async () => {
  const prisma: any = { document: { findUnique: jest.fn(async () => ({ id: 'doc-phone-00000001', userId: 'u1', organizationId: 'o1' })) } };
  const svc: any = Object.assign(Object.create(DocumentsService.prototype), { prisma });
  svc.assertNotExternal = jest.fn();
  svc.assertStagingKey = jest.fn();
  svc.takeStagedObject = jest.fn();
  const res = await svc.submitOwnDocument({
    id: 'doc-phone-00000001', actor: { userId: 'u1', organizationId: 'o1' }, stagingKey: 'k', typeId: 't',
  });
  expect(res.id).toBe('doc-phone-00000001');
  expect(svc.takeStagedObject).not.toHaveBeenCalled();
});

it("refuses somebody else's document id", async () => {
  const prisma: any = { document: { findUnique: jest.fn(async () => ({ id: 'doc-phone-00000001', userId: 'someone', organizationId: 'o1' })) } };
  const svc: any = Object.assign(Object.create(DocumentsService.prototype), { prisma });
  svc.assertNotExternal = jest.fn();
  await expect(
    svc.submitOwnDocument({ id: 'doc-phone-00000001', actor: { userId: 'u1', organizationId: 'o1' }, stagingKey: 'k', typeId: 't' }),
  ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ID_IN_USE' }) });
});
