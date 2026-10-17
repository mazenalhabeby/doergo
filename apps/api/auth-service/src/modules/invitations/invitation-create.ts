import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Role,
  INVITATION_DEFAULT_EXPIRY_HOURS,
  INVITATION_MAX_EXPIRY_HOURS,
  INVITATION_MIN_EXPIRY_HOURS,
  permissionsFromOrgRole,
  mergePermissions,
  permissionsExceed,
  mayGrantBaseRole,
  SHARED_ROLE_WHERE,
  type PermissionSet,
} from '@hbcfield/shared';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateInvitationMessage } from '@hbcfield/shared/microservices';

/** The input is the message contract's request type (shared with the gateway). */
export type CreateInvitationInput = CreateInvitationMessage;

/** The steps of `InvitationService.createInvitation`, in the order it runs them. */

export interface InvitationRefusal {
  success: false;
  statusCode: HttpStatus;
  message: string;
}

export type CreatorPerms = ReturnType<typeof mergePermissions>;

export function refuse(statusCode: HttpStatus, message: string): InvitationRefusal {
  return { success: false, statusCode, message };
}

/** Who may be invited, and by whom. Null = allowed. */
export function targetRoleRefusal(data: CreateInvitationInput): InvitationRefusal | null {
  // Non-admin creators may only invite employees (never admins or customers).
  // The same rule join-request approval asks (`mayGrantBaseRole`).
  if (!mayGrantBaseRole(data.creatorRole, data.targetRole)) {
    return refuse(HttpStatus.FORBIDDEN, 'You can only invite employees');
  }
  // Cannot invite ADMIN role (one admin per org via self-registration)
  if (data.targetRole === Role.ADMIN) {
    return refuse(HttpStatus.BAD_REQUEST, 'Cannot create invitations for ADMIN role');
  }
  // Target role must be EMPLOYEE or CUSTOMER (ADMIN already blocked above).
  if (data.targetRole !== Role.EMPLOYEE && data.targetRole !== Role.CUSTOMER) {
    return refuse(HttpStatus.BAD_REQUEST, 'Target role must be EMPLOYEE or CUSTOMER');
  }
  return null;
}

/** Customer invites must name an existing Customer in this org (fail closed). */
export async function customerTargetRefusal(
  prisma: PrismaService,
  data: CreateInvitationInput,
): Promise<InvitationRefusal | null> {
  if (!data.customerId) {
    return refuse(HttpStatus.BAD_REQUEST, 'customerId is required for a customer invite');
  }
  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, organizationId: data.organizationId },
    select: { id: true },
  });
  if (!customer) {
    return refuse(HttpStatus.NOT_FOUND, 'Customer not found in this organization');
  }
  if (data.unitId) {
    const unit = await prisma.customerUnit.findFirst({
      where: { id: data.unitId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!unit) {
      return refuse(HttpStatus.NOT_FOUND, 'Unit not found in this organization');
    }
  }
  // Same check for an asset: an id from another tenant must not become the
  // place a login is confined to.
  if (data.assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: data.assetId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!asset) {
      return refuse(HttpStatus.NOT_FOUND, 'Asset not found in this organization');
    }
  }
  return null;
}

/**
 * Validate a pre-assigned org role (EMPLOYEE invites only): must be an
 * active ORG/BOTH-scoped role in THIS org. Fail closed — never trust the id.
 */
export async function checkPreassignedOrgRole(
  prisma: PrismaService,
  data: CreateInvitationInput & { memberRoleId: string },
  creatorIsAdmin: boolean,
  creatorPerms: CreatorPerms,
): Promise<{ refusal: InvitationRefusal } | { roleId: string }> {
  const role = await prisma.accessRole.findFirst({
    where: {
      id: data.memberRoleId,
      organizationId: data.organizationId,
      isActive: true,
      scope: { in: ['ORG', 'BOTH'] },
      ...SHARED_ROLE_WHERE,
    },
    select: { id: true },
  });
  if (!role) {
    return { refusal: refuse(HttpStatus.BAD_REQUEST, 'Invalid role') };
  }
  // Ceiling guard: a non-admin creator cannot pre-assign a role that grants
  // more than they hold (privilege escalation via invitation pre-assignment).
  if (!creatorIsAdmin) {
    const targetRole = await prisma.accessRole.findFirst({
      where: { id: role.id, organizationId: data.organizationId },
      select: { permissions: true },
    });
    if (permissionsExceed(creatorPerms, permissionsFromOrgRole(targetRole?.permissions))) {
      return {
        refusal: refuse(HttpStatus.FORBIDDEN, 'You cannot assign a role with permissions beyond your own'),
      };
    }
  }
  return { roleId: role.id };
}

/** Clamped to the allowed window. */
export function invitationExpiresAt(expiresInHoursAsked: number | undefined): Date {
  const expiresInHours = Math.min(
    Math.max(expiresInHoursAsked || INVITATION_DEFAULT_EXPIRY_HOURS, INVITATION_MIN_EXPIRY_HOURS),
    INVITATION_MAX_EXPIRY_HOURS,
  );
  return new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
}

/** The member/customer fields of the new row — everything validated before this is called. */
export function invitationTargetFields(
  data: CreateInvitationInput,
  ctx: {
    inviteIsExternal: boolean;
    validMemberRoleId: string | null;
    externalSpacePermissions: PermissionSet | null;
    accessProfile: unknown;
  },
) {
  const isTechnician = data.targetRole === Role.EMPLOYEE;
  const isCustomerInvite = data.targetRole === Role.CUSTOMER;
  const { inviteIsExternal } = ctx;
  return {
    // Job title (e.g. "Plumber"). Blank → null, NOT a work-mode value.
    position: isTechnician ? data.position?.trim() || null : null,
    // Schedule pre-set on the invite (applied to the user on accept).
    /*
      No schedule for an external member.

      A schedule is the hours WE expect somebody to work. This person's
      hours are their own employer's business — they come to approve ours,
      not to file theirs. Left set, a rota line for them sits permanently
      unmet and the no-show engine starts raising flags against a company
      that owes us no attendance at all.

      Enforced here as well as hidden in the form: the form is a courtesy,
      this is the rule.
    */
    scheduleType: isTechnician && !inviteIsExternal ? data.scheduleType || null : null,
    schedule:
      isTechnician && !inviteIsExternal && data.scheduleType === 'FIXED' && data.schedule?.length
        ? (data.schedule as any)
        : undefined,
    monthlyHourBudget:
      isTechnician && !inviteIsExternal && data.scheduleType === 'FLEXIBLE' ? (data.monthlyHourBudget ?? null) : null,
    specialty: isTechnician ? data.specialty || null : null,
    maxDailyJobs: isTechnician ? data.maxDailyJobs || null : null,
    // Pre-assigned space — applied to the user on accept.
    spaceId: isTechnician ? data.spaceId || null : null,
    // Pre-assigned org role (validated above) — applied to the user on accept.
    memberRoleId: isTechnician ? ctx.validMemberRoleId : null,
    // Who they work for. Only meaningful on a member invite.
    isExternal: isTechnician ? inviteIsExternal : false,
    // Their permissions in `spaceId`, validated above; applied on accept (see applyInvitationPlacement).
    spacePermissions:
      isTechnician && ctx.externalSpacePermissions
        ? (ctx.externalSpacePermissions as Prisma.InputJsonValue)
        : undefined,
    // Pre-configured Access Profile — sanitized and capped by the caller, re-sanitized on accept.
    accessProfile: isTechnician ? ((ctx.accessProfile as unknown as Prisma.InputJsonValue) ?? undefined) : undefined,
    // Customer-portal invite target (bound to the new login on accept).
    customerId: isCustomerInvite ? data.customerId || null : null,
    unitId: isCustomerInvite ? data.unitId || null : null,
    assetId: isCustomerInvite ? data.assetId || null : null,
  };
}

type CreatedInvitation = Prisma.InvitationGetPayload<{
  include: {
    organization: { select: { id: true; name: true } };
    createdBy: { select: { id: true; firstName: true; lastName: true } };
  };
}>;

/** What the creator is answered — the only time the plain code is returned. */
export function createdInvitationView(invitation: CreatedInvitation, code: string) {
  return {
    id: invitation.id,
    code, // Plain code -- only returned on creation
    targetRole: invitation.targetRole,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    // What this login will be tied to, echoed back so the caller can show
    // it — and so a test can tell "stored" from "silently dropped".
    customerId: invitation.customerId,
    unitId: invitation.unitId,
    assetId: invitation.assetId,

    position: invitation.position,
    specialty: invitation.specialty,
    maxDailyJobs: invitation.maxDailyJobs,
    isExternal: invitation.isExternal,
    spaceId: invitation.spaceId,
    memberRoleId: invitation.memberRoleId,
    spacePermissions: (invitation.spacePermissions as PermissionSet | null) ?? null,
    organization: invitation.organization,
    createdBy: invitation.createdBy,
    createdAt: invitation.createdAt.toISOString(),
  };
}
