import { ForbiddenException } from '@nestjs/common';
import { assertNotSelfDecision } from '../self-decision';

/*
  A stand-in decides the leader's items while the leader is away — but never
  about the leader: their OWN requests go to somebody else (or a leader could
  choose who signs their own overtime). The rule sits in the one self-decision
  check every kind already calls.
*/
describe('a stand-in never decides about the leader they cover', () => {
  const prisma = (covering: boolean) => ({
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    approvalDelegation: { findFirst: jest.fn().mockResolvedValue(covering ? { id: 'd1' } : null) },
  });

  it('refused with its own code while standing in for that person', async () => {
    const p = prisma(true);
    await expect(assertNotSelfDecision(p as never, { deciderId: 'deputy', subjectId: 'leader', organizationId: 'o', message: 'x' }))
      .rejects.toMatchObject({ response: { code: 'STAND_IN_FOR_SUBJECT' } });
    const where = p.approvalDelegation.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: 'o', fromUserId: 'leader', toUserId: 'deputy', revokedAt: null });
  });

  it('anybody else is decided as before', async () => {
    await expect(assertNotSelfDecision(prisma(false) as never, { deciderId: 'deputy', subjectId: 'worker', organizationId: 'o', message: 'x' }))
      .resolves.toBeUndefined();
  });

  it('their own item is still the self rule', async () => {
    await expect(assertNotSelfDecision(prisma(false) as never, { deciderId: 'a', subjectId: 'a', organizationId: 'o', message: 'own' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
