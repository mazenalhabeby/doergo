import { combinedServices } from '../../../common/testing/combined-services';
import { AssetExpenseService } from '../asset-expense.service';
import { AssetExpenseReviewService } from '../asset-expense-review.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetExpenseService, as ONE object — the tests were written against the single class. */
export type AssetExpenseServiceParts = Public<AssetExpenseService> & Public<AssetExpenseReviewService>;

export function assetExpenseParts(...args: unknown[]): AssetExpenseServiceParts {
  const assetExpenseService = new (AssetExpenseService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const assetExpenseReviewService = new (AssetExpenseReviewService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<AssetExpenseServiceParts>(assetExpenseService, assetExpenseReviewService);
}

/** The same, from a Nest test module that registered them all. */
export function assetExpensePartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AssetExpenseServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AssetExpenseService, AssetExpenseReviewService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<AssetExpenseServiceParts>(...parts);
}
