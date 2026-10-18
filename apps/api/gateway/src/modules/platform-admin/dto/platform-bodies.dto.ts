import type { RoutingConditions } from '@hbcfield/shared';
import { OptAny, OptArray, OptBoolean, OptIn, OptNumber, OptObject, OptString } from '../../../common/dto/body-fields';

/*
  Operator-console bodies (CODE_AUDIT.md B3). Client: apps/admin (lib/api/endpoints.ts, the
  Teams and Library panels); bootstrap is a break-glass call. Only TYPES are checked — the
  staff pickers (pickStaffCreate / pickStaffPatch) and the services keep every rule.
*/

/** POST /platform/auth/login */
export class StaffLoginDto {
  @OptString() email?: string;
  @OptString() password?: string;
  @OptString() code?: string;
}

/** POST /platform/auth/change-password */
export class StaffChangePasswordDto {
  @OptString() currentPassword?: string;
  @OptString() newPassword?: string;
}

/** POST /platform/auth/2fa/setup · enable · disable */
export class StaffCodeDto {
  @OptString() code?: string;
}

/** POST /platform/auth/bootstrap · POST /platform/users — the fields pickStaffCreate reads. */
export class StaffCreateDto {
  @OptString() email?: string;
  @OptString() password?: string;
  @OptString() firstName?: string;
  @OptString() lastName?: string;
  @OptString() role?: string;
}

/** PATCH /platform/users/:id — the fields pickStaffPatch reads. */
export class StaffPatchDto {
  @OptString() role?: string;
  @OptBoolean() isActive?: boolean;
}

/** POST /platform/users/:id/reset-password */
export class StaffResetPasswordDto {
  @OptString() password?: string;
}

/** POST /platform/orgs/:id/extend-trial — `Number(days) || 14`, as before. */
export class ExtendTrialDto {
  @OptNumber() days?: number;
}

/** POST /platform/orgs/:id/agreed-price */
export class AgreedPriceDto {
  @OptNumber() monthlyCents?: number;
  @OptString() until?: string | null;
  @OptString() note?: string | null;
}

/** POST /platform/orgs/:id/billing-mode — the mode is upper-cased and checked in the route. */
export class BillingModeDto {
  @OptString() mode?: string;
  @OptNumber() invoiceDueDays?: number;
}

/** POST /platform/support/tickets/:id/messages */
export class SupportReplyDto {
  @OptString() body?: string;
  @OptArray() attachments?: Array<{ fileName: string; fileUrl: string; fileType: string; fileSize: number }>;
  @OptBoolean() isInternalNote?: boolean;
}

/** POST /platform/support/tickets/:id/status */
export class SupportStatusDto {
  @OptString() status?: string;
}

/** POST /platform/support/tickets/:id/assign — null clears; absent leaves it (or self-claims). */
export class SupportAssignDto {
  @OptString() agentId?: string | null;
  @OptString() teamId?: string | null;
}

/** POST /platform/support/teams */
export class SupportTeamCreateDto {
  @OptString() name!: string;
  @OptString() color?: string;
  @OptString() description?: string;
}

/** PUT /platform/support/teams/:teamId */
export class SupportTeamUpdateDto {
  @OptString() name?: string;
  @OptString() color?: string | null;
  @OptString() description?: string | null;
  @OptBoolean() isActive?: boolean;
}

/** POST /platform/support/teams/:teamId/members */
export class SupportTeamMemberDto {
  @OptString() platformUserId!: string;
  @OptIn(['MANAGER', 'AGENT']) teamRole?: 'MANAGER' | 'AGENT';
}

/** POST /platform/support/teams/:teamId/rules — { id?, name, order, isActive, conditions }. */
export class SupportRuleDto {
  @OptString() id?: string;
  @OptString() name!: string;
  @OptObject() conditions!: RoutingConditions;
  @OptNumber() order?: number;
  @OptBoolean() isActive?: boolean;
}

/** POST /platform/support/teams/pin-org */
export class PinOrgDto {
  @OptString() organizationId!: string;
  @OptString() teamId!: string | null;
}

/** POST · PATCH /platform/library/templates — the Library panel's save. */
export class LibraryTemplateDto {
  @OptString() slug?: string;
  @OptString() name?: string;
  @OptString() description?: null | string;
  @OptString() industry?: null | string;
  @OptString() icon?: null | string;
  @OptNumber() position?: number;
  @OptBoolean() isPublished?: boolean;
  @OptAny() statuses?: unknown;
}

/** PATCH /platform/library/templates/:id/publish */
export class LibraryPublishDto {
  @OptBoolean() isPublished?: boolean;
}

/** POST /platform/library/templates/import/:workflowId */
export class LibraryImportDto {
  @OptString() slug?: string;
  @OptString() industry?: string;
}
