/**
 * A document a member supplied offline, sent twice, is filed once — the second
 * send must not fail on the upload the first already moved out of staging.
 */
import { NotFoundException } from '@nestjs/common';
import { DocumentSupplyService } from '../issuing/document-supply.service';

const service = (prisma: any) => {
  const svc: any = Object.assign(Object.create(DocumentSupplyService.prototype), {
    prisma,
    storage: { takeStagedObject: jest.fn() },
  });
  svc.assertNotExternal = jest.fn();
  return svc;
};
const submit = (svc: any) =>
  svc.submitOwnDocument({
    id: 'doc-phone-00000001',
    actor: { userId: 'u1', organizationId: 'o1' },
    stagingKey: 'k',
    typeId: 't',
  });

it('returns the filed document for a resend, before touching staging', async () => {
  const svc = service({
    document: { findFirst: jest.fn(async () => ({ id: 'doc-phone-00000001', userId: 'u1', organizationId: 'o1' })) },
  });
  const res = await submit(svc);
  expect(res.id).toBe('doc-phone-00000001');
  expect(svc.storage.takeStagedObject).not.toHaveBeenCalled();
});

it("refuses somebody else's document id", async () => {
  const svc = service({
    document: {
      findFirst: jest.fn(async () => ({ id: 'doc-phone-00000001', userId: 'someone', organizationId: 'o1' })),
    },
  });
  await expect(submit(svc)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ID_IN_USE' }) });
});

it("another organization's id is looked up in the caller's organization only, and answered 404", async () => {
  const prisma = { document: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 1) } };
  const svc = service(prisma);
  await expect(submit(svc)).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.document.findFirst.mock.calls[0]).toEqual([
    { where: { id: 'doc-phone-00000001', organizationId: 'o1' } },
  ]);
  expect(svc.storage.takeStagedObject).not.toHaveBeenCalled();
});
