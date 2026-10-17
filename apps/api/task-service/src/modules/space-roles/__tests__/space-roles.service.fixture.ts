import { combinedServices } from '../../../common/testing/combined-services';
import { SpaceRolesService } from '../space-roles.service';
import { RoleAdminService } from '../role-admin.service';
import { SpaceMembersService } from '../space-members.service';
import { MemberRolesService } from '../member-roles.service';
import { MemberTermsService } from '../member-terms.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of SpaceRolesService, as ONE object — the tests were written against the single class. */
export type SpaceRolesServiceParts = Public<SpaceRolesService> &
  Public<RoleAdminService> &
  Public<SpaceMembersService> &
  Public<MemberRolesService> &
  Public<MemberTermsService>;

export function spaceRoleServices(...args: unknown[]): SpaceRolesServiceParts {
  return combinedServices<SpaceRolesServiceParts>(
    new (SpaceRolesService as unknown as new (...a: unknown[]) => object)(...args),
    new (RoleAdminService as unknown as new (...a: unknown[]) => object)(...args),
    new (SpaceMembersService as unknown as new (...a: unknown[]) => object)(...args),
    new (MemberRolesService as unknown as new (...a: unknown[]) => object)(...args),
    new (MemberTermsService as unknown as new (...a: unknown[]) => object)(...args),
  );
}
