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
