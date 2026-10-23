import { combinedServices } from '../../../common/testing/combined-services';
import { AssetsService } from '../register/assets.service';
import { AssetCreateService } from '../register/asset-create.service';
import { AssetUpdateService } from '../register/asset-update.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetsService, as ONE object — the tests were written against the single class. */
export type AssetsServiceParts = Public<AssetsService> & Public<AssetCreateService> & Public<AssetUpdateService>;

/** The three record services over the same collaborators, in the order the old single class took them. */
export function assetServices(
  prisma?: any,
  access?: any,
  activity?: any,
  holderService?: any,
  custody?: any,
): AssetsServiceParts {
  return combinedServices<AssetsServiceParts>(
    new AssetsService(prisma, access),
    new AssetCreateService(prisma, access, holderService),
    new AssetUpdateService(prisma, access, activity, holderService, custody),
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
