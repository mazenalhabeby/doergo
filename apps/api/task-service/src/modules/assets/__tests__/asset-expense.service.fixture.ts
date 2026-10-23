import { combinedServices } from '../../../common/testing/combined-services';
import { AssetExpenseService } from '../expenses/asset-expense.service';
import { AssetExpenseReviewService } from '../expenses/asset-expense-review.service';
import { AssetExpenseGateService } from '../expenses/asset-expense-gate.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetExpenseService, as ONE object — the tests were written against the single class. */
export type AssetExpenseServiceParts = Public<AssetExpenseService> & Public<AssetExpenseReviewService>;

/** Filing and reviewing over the same collaborators; the custody gate is the real one. */
export function assetExpenseParts(
  prisma?: any,
  access?: any,
  custodyRead?: any,
  notifier?: any,
  store?: any,
  rules?: any,
): AssetExpenseServiceParts {
  const gate = new AssetExpenseGateService(prisma, access, custodyRead);
  return combinedServices<AssetExpenseServiceParts>(
    new AssetExpenseService(prisma, access, gate, notifier, store),
    new AssetExpenseReviewService(prisma, access, notifier, rules),
  );
}

/** The same, from a Nest test module that registered them all. */
export function assetExpensePartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AssetExpenseServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AssetExpenseService, AssetExpenseReviewService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<AssetExpenseServiceParts>(...parts);
}
