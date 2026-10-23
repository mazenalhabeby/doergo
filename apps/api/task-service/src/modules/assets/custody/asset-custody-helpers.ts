import { PrismaService } from '@hbcfield/shared';

/** Anything that can run the two tables — the client, or a transaction. */
type Db = Pick<PrismaService, 'assetCustody' | 'assetHolder' | 'assetMoney' | 'asset' | 'user'>;

/** The columns every custody reader needs, and no more. */
const CUSTODY_SELECT = {
  id: true,
  assetId: true,
  userId: true,
  customerId: true,
  startedAt: true,
  endedAt: true,
  reason: true,
  openedById: true,
  closedById: true,
} as const;

export { Db, CUSTODY_SELECT };
