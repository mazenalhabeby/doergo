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

/** The same, from a Nest test module that registered them all. */
export function locationServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): LocationServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [
    LocationService,
    WorkerLocationReadService,
    RouteReadService,
    LocationRetentionService,
    LocationBatchService,
  ].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<LocationServiceParts>(...parts);
}
