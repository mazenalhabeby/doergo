import { combinedServices } from '../../../common/testing/combined-services';
import { AssetCatalogService } from '../asset-catalog.service';
import { AssetTypesService } from '../asset-types.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetCatalogService, as ONE object — the tests were written against the single class. */
export type AssetCatalogServiceParts = Public<AssetCatalogService> & Public<AssetTypesService>;

export function assetCatalogParts(...args: unknown[]): AssetCatalogServiceParts {
  const assetCatalogService = new (AssetCatalogService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const assetTypesService = new (AssetTypesService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<AssetCatalogServiceParts>(assetCatalogService, assetTypesService);
}

/** The same, from a Nest test module that registered them all. */
export function assetCatalogPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AssetCatalogServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AssetCatalogService, AssetTypesService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<AssetCatalogServiceParts>(...parts);
}
