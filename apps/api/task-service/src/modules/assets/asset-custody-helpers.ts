import { PrismaService } from '../../common/prisma/prisma.service';

/** Anything that can run the two tables — the client, or a transaction. */
type Db = Pick<PrismaService, 'assetCustody' | 'assetHolder' | 'assetMoney' | 'asset' | 'user'>;

export { Db };
