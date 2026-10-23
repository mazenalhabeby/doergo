import { combinedServices } from '../../../common/testing/combined-services';
import { AssetLogService } from '../logbook/asset-log.service';
import { AssetLogReadService } from '../logbook/asset-log-read.service';
import { AssetLogAccessService } from '../logbook/asset-log-access.service';
import { AssetLogStateService } from '../logbook/asset-log-state.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetLogService, as ONE object — the tests were written against the single class. */
export type AssetLogServiceParts = Public<AssetLogService> & Public<AssetLogReadService>;

/**
 * The logbook's writer and reader over the same collaborators. `expenseReviews`
 * defaults to `expenses` — a test double for both answers `review` and `forgetReceipt`.
 */
export function assetLogParts(
  prisma: any,
  access: any,
  custodyRead: any,
  expenses: any,
  store: any,
  expenseReviews: any = expenses,
): AssetLogServiceParts {
  const logAccess = new AssetLogAccessService(prisma, access, custodyRead);
  const state = new AssetLogStateService(prisma);
  return combinedServices<AssetLogServiceParts>(
    new AssetLogService(prisma, access, logAccess, state, expenses, expenseReviews, store),
    new AssetLogReadService(prisma, access, logAccess),
  );
}
