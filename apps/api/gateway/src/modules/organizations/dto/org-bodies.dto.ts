import { OptAny, OptBoolean, OptObject, OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Organization settings bodies (CODE_AUDIT.md B3). Clients: the web's settings, roles and
  member pages. Only TYPES are checked.
*/

/**
 * PATCH /organizations/leave-policy — read in auth-service by `parseLeavePolicy`, which answers
 * a CODED refusal (LEAVE_ALLOWANCE_INVALID…). The numbers are therefore passed AS SENT
 * (`number | string` → no conversion, no generic 400): the parser decides.
 */
export class LeavePolicyDto {
  @OptAny() defaultLeaveAllowance?: number | string;
  @OptString() leaveYearMode?: string;
  @OptString() carryOverMode?: string;
  @OptAny() carryOverMaxDays?: number | string | null;
  @OptAny() carryExpiresAfterMonths?: number | string | null;
  @OptString() leaveTrackingStartedOn?: string | null;
}

/** PATCH /organizations/profile-badges — the three switches of ProfileBadgesConfig. */
export class ProfileBadgesDto {
  @OptBoolean() showRole!: boolean;
  @OptBoolean() showType?: boolean;
  @OptBoolean() showSpecialty!: boolean;
}

/** PUT /organizations/members/:id/watchers */
export class MemberWatchersDto {
  @OptStrings() watcherIds!: string[];
}

/** POST /organizations/roles */
export class CreateOrgRoleDto {
  @OptString() name!: string;
  @OptString() description?: string;
  @OptString() color?: string;
  @OptObject() permissions?: Record<string, boolean>;
}

/** PATCH /organizations/roles/:id */
export class UpdateOrgRoleDto {
  @OptString() name?: string;
  @OptString() description?: string;
  @OptString() color?: string;
  @OptObject() permissions?: Record<string, boolean>;
}
