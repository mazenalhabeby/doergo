import { combinedServices } from '../../../common/testing/combined-services';
import { AssetCustodyService } from '../asset-custody.service';
import { CustodyReadService } from '../custody-read.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetCustodyService, as ONE object — the tests were written against the single class. */
export type AssetCustodyServiceParts = Public<AssetCustodyService> & Public<CustodyReadService>;

export function custodyServices(...args: unknown[]): AssetCustodyServiceParts {
  return combinedServices<AssetCustodyServiceParts>(
    new (AssetCustodyService as unknown as new (...a: unknown[]) => object)(...args),
    new (CustodyReadService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function custodyServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AssetCustodyServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AssetCustodyService, CustodyReadService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<AssetCustodyServiceParts>(...parts);
}
