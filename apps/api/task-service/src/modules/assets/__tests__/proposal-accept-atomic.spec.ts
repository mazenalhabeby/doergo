import { NotFoundException } from '@nestjs/common';
import { ProposalReviewService } from '../proposals/proposal-review.service';

/**
 * Accepting papers marks the proposal ACCEPTED (with the asset it created) in
 * the SAME transaction that creates the asset. Marked afterwards, a failure of
 * that one update put the proposal back in the queue with a vehicle already on
 * the books — and the next accept created a second one.
 */
describe('accepting a proposal is one transaction with the create', () => {
  const PENDING = {
    id: 'p1', organizationId: 'o1', raisedById: 'u-ahmed', holderUserId: null, categoryId: 'k1',
    fields: { registration: 'GM-472 DK' }, status: 'ACCEPTED',
  };

  function setup(markCount: number) {
    const tx: any = { assetProposal: { updateMany: jest.fn().mockResolvedValue({ count: markCount }) } };
    const prisma: any = {
      assetProposal: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(PENDING),
        update: jest.fn(),
      },
    };
    // The real apply runs the hook inside its transaction; a throw there rolls the create back.
    const contracts: any = {
      assertMay: jest.fn(),
      apply: jest.fn(async (_d: unknown, options: any) => {
        await options.withinTransaction(tx, { id: 'a-new', name: 'GM-472 DK' });
        return { data: { assetId: 'a-new', name: 'GM-472 DK' } };
      }),
    };
    const places: any = { assertReviewable: jest.fn(), ruleFacts: jest.fn().mockResolvedValue(null) };
    const notices: any = { decided: jest.fn() };
    const svc = new ProposalReviewService(prisma, contracts, places, notices, null, {} as any);
    const accept = () => svc.accept({ id: 'p1', userId: 'u-boss', userRole: 'ADMIN', organizationId: 'o1' } as any);
    return { tx, prisma, accept, notices };
  }

  it('writes createdAssetId inside the create’s transaction, on its own claim', async () => {
    const { tx, prisma, accept } = setup(1);
    await expect(accept()).resolves.toMatchObject({ data: { assetId: 'a-new', status: 'ACCEPTED' } });
    expect(tx.assetProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', status: 'ACCEPTED', createdAssetId: null },
        data: expect.objectContaining({ createdAssetId: 'a-new', reviewedById: 'u-boss' }),
      }),
    );
    // Nothing is marked after the transaction any more.
    expect(prisma.assetProposal.update).not.toHaveBeenCalled();
  });

  it('a mark that misses fails the whole accept (the create rolls back) and re-queues it', async () => {
    const { prisma, accept, notices } = setup(0);
    await expect(accept()).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.assetProposal.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    );
    expect(notices.decided).not.toHaveBeenCalled();
  });
});
