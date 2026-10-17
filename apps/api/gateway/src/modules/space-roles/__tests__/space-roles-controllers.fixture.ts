import { combinedServices } from '../../../common/testing/combined-services';
import { SpaceRolesController } from '../space-roles.controller';
import { SpaceMembersController } from '../space-members.controller';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Both space-roles controllers — one class until 2026-10-17, the members routes split out since. */
export type SpaceRolesControllers = Public<SpaceRolesController> & Public<SpaceMembersController>;

export function spaceRolesControllers(...args: unknown[]): SpaceRolesControllers {
  return combinedServices<SpaceRolesControllers>(
    new (SpaceRolesController as unknown as new (...a: unknown[]) => object)(...args),
    new (SpaceMembersController as unknown as new (...a: unknown[]) => object)(...args),
  );
}
