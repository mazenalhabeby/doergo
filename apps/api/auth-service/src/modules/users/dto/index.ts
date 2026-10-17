import { Role } from '@hbcfield/shared';
import {
  type UpdateMemberProfileDto,
  type ListOrgMembersDto,
  type GetEmployeeDetailDto,
  type ListEmployeesDto,
  type UpdateEmployeeDto,
  type CreateEmployeeDto,
} from '@hbcfield/shared/microservices';
/** The message contract's type (shared with the gateway). */
export type { CreateEmployeeDto };

/** The message contract's type (shared with the gateway). */
export type { UpdateEmployeeDto };

/** The message contract's type (shared with the gateway). */
export type { ListEmployeesDto };

/** The message contract's type (shared with the gateway). */
export type { GetEmployeeDetailDto };

// ============================================================================
// ORGANIZATION MEMBERS DTOs
// ============================================================================

/** The message contract's type (shared with the gateway). */
export type { ListOrgMembersDto };

/** The message contract's type (shared with the gateway). */
export type { UpdateMemberProfileDto };

/**
 * DTO for removing a member
 */
export interface RemoveMemberDto {
  memberId: string;
  organizationId: string;
  requesterId: string;
}

// Backward-compatible aliases for internal message patterns
