import { combinedServices } from '../../../common/testing/combined-services';
import { LocationsController } from '../locations.controller';
import { LocationMembersController } from '../location-members.controller';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every /locations controller — one class until 2026-10-17, the members routes split out since. */
export type LocationsControllers = Public<LocationsController> & Public<LocationMembersController>;

export function locationsControllers(...args: unknown[]): LocationsControllers {
  return combinedServices<LocationsControllers>(
    new (LocationsController as unknown as new (...a: unknown[]) => object)(...args),
    new (LocationMembersController as unknown as new (...a: unknown[]) => object)(...args),
  );
}
