import { Prisma } from '@prisma/client';
import { PrismaService } from '@hbcfield/shared';
import { type AssetActor } from '../core/asset-access.service';

/**
 * How many reading-carrying entries the recompute reads to find each meter's
 * latest value. Newest first, so the latest of every meter written in the last
 * 200 readings is exact; a meter nobody has read in 200 entries keeps nothing
 * rather than a stale value — and 200 readings is years of fuel slips.
 */
const READINGS_WINDOW = 200;

type Db = PrismaService | Prisma.TransactionClient;

type Actor = AssetActor;

export { READINGS_WINDOW, Db, Actor };
