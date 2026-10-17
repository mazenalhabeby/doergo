import { rpc } from '../contract';

/** Invitations (auth-service `InvitationController`). */

export interface CreateInvitationMessage {
  targetRole: string;
  organizationId: string;
  createdById: string;
  creatorRole: string;
  expiresInHours?: number;
  position?: string;
  scheduleType?: string;
  schedule?: { dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }[];
  monthlyHourBudget?: number;
  enabledModules?: string[];
  specialty?: string;
  maxDailyJobs?: number;
  spaceId?: string;
  // Pre-assigned org role (AccessRole id) applied to the member on accept.
  memberRoleId?: string;
  isExternal?: boolean;
  /**
   * What an EXTERNAL invitee may do in `spaceId`, built in the permission
   * builder — the alternative to naming a role. Becomes their personal role
   * (or the shared role it exactly matches) when they accept.
   */
  spacePermissions?: unknown;
  // Full pre-configured Access Profile (applied to the member on accept).
  accessProfile?: unknown;
  // Customer-portal invite (targetRole = CUSTOMER)
  customerId?: string;
  unitId?: string;
  /** Invite the client to one ASSET — any type whose records a client holds. */
  assetId?: string;
  /** Sent by the customer/portal invite routes; createInvitation does not read it. */
  portalId?: string;
  // When present, the invite code is ALSO emailed to this address automatically.
  email?: string;
}

export interface AcceptInvitationMessage {
  code: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export const createInvitation = rpc<CreateInvitationMessage>('create_invitation');
export const validateInvitation = rpc<{ code: string }>('validate_invitation');
export const acceptInvitation = rpc<AcceptInvitationMessage>('accept_invitation');
export const listInvitations = rpc<{ organizationId: string; status?: string; page?: number; limit?: number }>(
  'list_invitations',
);
export const resendInvitation = rpc<{ organizationId: string; customerId: string }>('resend_invitation');
export const revokeInvitation = rpc<{ invitationId: string; organizationId: string; userId: string }>(
  'revoke_invitation',
);
