import { combinedServices } from '../../../common/testing/combined-services';
import { AssetLogService } from '../logbook/asset-log.service';
import { AssetLogReadService } from '../logbook/asset-log-read.service';

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
