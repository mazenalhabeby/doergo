import { CustodyReadService } from '../custody/custody-read.service';

/**
 * A receipt carries a DAY: the custody gate asks "held at any moment of that
 * local day", in the record's workspace zone (decision 2026-10-29).
 */
describe('CustodyReadService.heldBy — the whole local day', () => {
  const prisma: any = {
    assetCustody: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Vienna' }) },
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: null }) },
  };
  const read = new CustodyReadService(prisma, {} as any);

  it('asks for a period overlapping the Vienna day, not one covering noon', async () => {
    // A past day as the phone files it: 12:00 Vienna on 10 Sept.
    await read.heldBy('a1', 'ahmed', new Date('2026-09-10T10:00:00Z'), { spaceId: 's1', organizationId: 'o1' });
    const where = prisma.assetCustody.findFirst.mock.calls[0][0].where;
    expect(where.startedAt).toEqual({ lt: new Date('2026-09-10T22:00:00.000Z') });
    expect(where.OR).toEqual([{ endedAt: null }, { endedAt: { gt: new Date('2026-09-09T22:00:00.000Z') } }]);
  });
});
