import { combinedServices } from '../../../common/testing/combined-services';
import { AssetLogService } from '../asset-log.service';
import { AssetLogReadService } from '../asset-log-read.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetLogService, as ONE object — the tests were written against the single class. */
export type AssetLogServiceParts = Public<AssetLogService> & Public<AssetLogReadService>;

export function assetLogParts(...args: unknown[]): AssetLogServiceParts {
  return combinedServices<AssetLogServiceParts>(
    new (AssetLogService as unknown as new (...a: unknown[]) => object)(...args),
    new (AssetLogReadService as unknown as new (...a: unknown[]) => object)(...args),
  );
}

/** The same, from a Nest test module that registered them all. */
export function assetLogPartsOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AssetLogServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AssetLogService, AssetLogReadService].flatMap((C) => {
    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }
  });
  return combinedServices<AssetLogServiceParts>(...parts);
}
