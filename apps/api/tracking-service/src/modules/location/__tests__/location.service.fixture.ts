import { combinedServices } from '../../../common/testing/combined-services';
import { LocationService } from '../location.service';
import { WorkerLocationReadService } from '../worker-location-read.service';
import { RouteReadService } from '../route-read.service';
import { LocationRetentionService } from '../location-retention.service';
import { LocationBatchService } from '../location-batch.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of LocationService, as ONE object — the tests were written against the single class. */
export type LocationServiceParts = Public<LocationService> &
  Public<WorkerLocationReadService> &
  Public<RouteReadService> &
  Public<LocationRetentionService> &
  Public<LocationBatchService>;

export function locationServices(...args: unknown[]): LocationServiceParts {
  return combinedServices<LocationServiceParts>(
    new (LocationService as unknown as new (...a: unknown[]) => object)(...args),
    new (WorkerLocationReadService as unknown as new (...a: unknown[]) => object)(...args),
    new (RouteReadService as unknown as new (...a: unknown[]) => object)(args[0], args[2]),
    new (LocationRetentionService as unknown as new (...a: unknown[]) => object)(...args),
    new (LocationBatchService as unknown as new (...a: unknown[]) => object)(...args),
  );
}
