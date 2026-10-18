import { OptBoolean, OptNumber, OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Client-portal bodies (CODE_AUDIT.md B3). Clients: the web's portal pages
  (lib/api/portal-admin.ts, space-portal.ts, space-units.ts), the phone's office queue
  (portal-office.ts, triage) and the approvals inbox (triage { spaceId }). Unit bodies use
  the shared UnitBodyDto. Only TYPES are checked; reach and rules stay in the services.
*/

/** POST /portal/admin/portals · POST /spaces/:spaceId/portal/portals */
export class CreatePortalDto {
  @OptString() templateKey?: string;
  @OptString() name?: string;
}

/** POST /portal/admin/requests/:id/triage */
export class TriageRequestDto {
  @OptString() spaceId!: string;
  @OptString() workflowId?: string | null;
  @OptString() priority?: string;
  @OptString() assignedToId?: string | null;
}

/** PATCH /portal/admin/portals/:id */
export class UpdatePortalDto {
  @OptString() name?: string;
  @OptString() templateKey?: string;
  @OptBoolean() reseed?: boolean;
  @OptString() spaceId?: string | null;
}

/** POST /portal/admin/categories */
export class CreatePortalCategoryDto {
  @OptString() portalId!: string;
  @OptString() key!: string;
  @OptString() label!: string;
  @OptString() icon?: string;
  @OptString() color?: string;
  @OptBoolean() urgent?: boolean;
  @OptString() team?: string;
  @OptString() defaultPriority?: string;
  @OptStrings() issues?: string[];
  @OptNumber() position?: number;
  @OptString() spaceId?: string;
}

/** PATCH /portal/admin/categories/:id — the web sends the category form again (portalId, key, position). */
export class UpdatePortalCategoryDto {
  @OptString() portalId?: string;
  @OptString() key?: string;
  @OptString() label?: string;
  @OptString() icon?: string | null;
  @OptString() color?: string | null;
  @OptBoolean() urgent?: boolean;
  @OptString() team?: string | null;
  @OptString() defaultPriority?: string | null;
  @OptStrings() issues?: string[];
  @OptNumber() position?: number;
  @OptBoolean() isActive?: boolean;
  @OptString() spaceId?: string | null;
}

/** POST /portal/admin/categories/reorder */
export class ReorderPortalCategoriesDto {
  @OptString() portalId!: string;
  @OptStrings() orderedIds!: string[];
}

/** POST /portal/admin/residents */
export class InviteResidentDto {
  @OptString() portalId!: string;
  @OptString() customerId?: string;
  @OptString() name?: string;
  @OptString() email?: string;
  @OptString() unitId?: string;
  @OptString() unitName?: string;
  @OptString() unitAddress?: string;
}

/** PATCH /spaces/:spaceId/portal */
export class UpdateSpacePortalDto {
  @OptString() templateKey?: string;
}

/** POST /spaces/:spaceId/portal/units/:unitId/assign */
export class AssignUnitCustomerDto {
  @OptString() customerId!: string;
}

/** POST /spaces/:spaceId/units/assign-member */
export class AssignUnitMemberDto {
  @OptString() userId!: string;
  @OptString() unitId?: string | null;
}

/** POST /spaces/:spaceId/units/:id/activities */
export class UnitActivityDto {
  @OptString() body?: string;
}
