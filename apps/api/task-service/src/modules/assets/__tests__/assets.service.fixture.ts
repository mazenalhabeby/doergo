import { combinedServices } from '../../../common/testing/combined-services';
import { AssetsService } from '../assets.service';
import { AssetCreateService } from '../asset-create.service';
import { AssetUpdateService } from '../asset-update.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetsService, as ONE object — the tests were written against the single class. */
export type AssetsServiceParts = Public<AssetsService> & Public<AssetCreateService> & Public<AssetUpdateService>;

export function assetServices(...args: unknown[]): AssetsServiceParts {
  return combinedServices<AssetsServiceParts>(
    new (AssetsService as unknown as new (...a: unknown[]) => object)(...args),
    new (AssetCreateService as unknown as new (...a: unknown[]) => object)(...args),
    new (AssetUpdateService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function assetServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AssetsServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AssetsService, AssetCreateService, AssetUpdateService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<AssetsServiceParts>(...parts);
}
