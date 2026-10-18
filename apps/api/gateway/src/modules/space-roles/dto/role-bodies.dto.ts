import type { PermissionSet, RoleKindValue } from '@hbcfield/shared';
import { OptBoolean, OptObject, OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Space role and member bodies (CODE_AUDIT.md B3). Clients: the web's role dialog and member
  dialogs only. Only TYPES are checked; the grant ceiling and the service keep every rule.
*/

/** POST /space-roles — the role dialog sends name, description, color, kind, permissions?, spaceId. */
export class CreateSpaceRoleDto {
  @OptString() name!: string;
  @OptString() description?: string;
  @OptString() color?: string;
  @OptObject() permissions?: PermissionSet;
  @OptString() kind?: RoleKindValue;
  @OptString() spaceId?: string;
}

/** PATCH /space-roles/:id */
export class UpdateSpaceRoleDto {
  @OptString() name?: string;
  @OptString() description?: string;
  @OptString() color?: string;
  @OptObject() permissions?: PermissionSet;
  @OptBoolean() isActive?: boolean;
  @OptString() kind?: RoleKindValue;
}

/** POST /spaces/:spaceId/members — { userId, spaceRoleId: id | null }. */
export class AssignSpaceMemberDto {
  @OptString() userId!: string;
  @OptString() spaceRoleId?: string | null;
}

/** PATCH /spaces/:spaceId/members/:memberId/routing — the six id lists. */
export class MemberRoutingDto {
  @OptStrings() notifyRoleIds?: string[];
  @OptStrings() notifyUserIds?: string[];
  @OptStrings() contactRoleIds?: string[];
  @OptStrings() contactUserIds?: string[];
  @OptStrings() approveRoleIds?: string[];
  @OptStrings() approveUserIds?: string[];
}
