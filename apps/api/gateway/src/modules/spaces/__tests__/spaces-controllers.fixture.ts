import { combinedServices } from '../../../common/testing/combined-services';
import { SpacesController } from '../spaces.controller';
import { SpaceAssignmentsController } from '../space-assignments.controller';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every /locations controller — one class until 2026-10-17, the members routes split out since. */
export type SpacesControllers = Public<SpacesController> & Public<SpaceAssignmentsController>;

export function spacesControllers(...args: unknown[]): SpacesControllers {
  return combinedServices<SpacesControllers>(
    new (SpacesController as unknown as new (...a: unknown[]) => object)(...args),
    new (SpaceAssignmentsController as unknown as new (...a: unknown[]) => object)(...args),
  );
}
