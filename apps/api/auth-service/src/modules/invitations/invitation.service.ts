import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { hashCode } from '@hbcfield/shared';
import {
  normalizeAccessProfile,
  Role,
  INVITATION_MAX_PENDING_PER_ORG,
  loadOrgPermissionCeiling,
  type PermissionSet,
} from '@hbcfield/shared';
import { InvitationServiceBase } from './invitation-service.base';
import {
  checkPreassignedOrgRole,
  createdInvitationView,
  customerTargetRefusal,
  invitationExpiresAt,
  invitationTargetFields,
  refuse,
  targetRoleRefusal,
  type CreateInvitationInput,
  type CreatorPerms,
} from './invitation-create';
import { emitEvent, invitationCreatedEvent } from '@hbcfield/shared/microservices';

@Injectable()
export class InvitationService extends InvitationServiceBase {
  /**
   * Create a new invitation.
   * ADMIN can invite DISPATCHER or TECHNICIAN.
   * DISPATCHER can only invite TECHNICIAN.
   */
  async createInvitation(data: CreateInvitationInput) {
    const isCustomerInvite = data.targetRole === Role.CUSTOMER;

    const roleRefusal = targetRoleRefusal(data);
    if (roleRefusal) return roleRefusal;

    if (isCustomerInvite) {
      const customerRefusal = await customerTargetRefusal(this.prisma, data);
      if (customerRefusal) return customerRefusal;
    }

    // Resolve the creator's OWN effective org permissions once (non-admins only).
    // Used as the ceiling for both a pre-assigned role and the Access Profile flags,
    // so a non-admin can never mint an account more privileged than themselves.
    let creatorPerms: CreatorPerms = {};
    const creatorIsAdmin = data.creatorRole === Role.ADMIN;
    if (!creatorIsAdmin) {
      // The shared loader every grant door uses — not found = no permissions.
      const creator = await loadOrgPermissionCeiling(this.prisma, data.createdById, data.organizationId);
      creatorPerms = creator?.perms ?? {};
    }

    /*
      External and org-wide role are mutually exclusive, refused at the door.

      An org role applies in every space, present and future, which is precisely
      what somebody who works for a client must not have. Checked here as well
      as on the member so the invitation cannot be used to arrive already
      holding one — the accept path applies what the invite says.
    */
    const inviteIsExternal = data.isExternal === true;
    // An external invitation names a shared SPACE role or a set of workspace
    // permissions — see checkExternalSpaceGrant for the rules and the ceiling.
    let externalGrant: { memberRoleId: string | null; spacePermissions: PermissionSet | null } = {
      memberRoleId: null,
      spacePermissions: null,
    };
    if (inviteIsExternal || data.spacePermissions != null) {
      const checked = await this.checkExternalSpaceGrant(data, creatorIsAdmin, inviteIsExternal);
      if ('refusal' in checked) return checked.refusal;
      externalGrant = checked;
    }

    let validMemberRoleId: string | null = externalGrant.memberRoleId;
    // Staff only: an external member's role was settled above (a SPACE role, never an org one).
    if (data.memberRoleId && data.targetRole === Role.EMPLOYEE && !inviteIsExternal) {
      const checked = await checkPreassignedOrgRole(
        this.prisma,
        { ...data, memberRoleId: data.memberRoleId },
        creatorIsAdmin,
        creatorPerms,
      );
      if ('refusal' in checked) return checked.refusal;
      validMemberRoleId = checked.roleId;
    }

    // Check pending invitation count for org
    const pendingCount = await this.prisma.invitation.count({
      where: { organizationId: data.organizationId, status: 'PENDING' },
    });
    if (pendingCount >= INVITATION_MAX_PENDING_PER_ORG) {
      return refuse(
        HttpStatus.BAD_REQUEST,
        `Maximum pending invitations (${INVITATION_MAX_PENDING_PER_ORG}) reached for this organization`,
      );
    }

    const unique = await this.uniqueInvitationCode();
    if (!unique) {
      this.logger.error('Failed to generate unique invitation code after max attempts');
      return refuse(HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to generate unique invitation code. Please try again.');
    }
    const { code, codeHash } = unique;

    const invitation = await this.prisma.invitation.create({
      data: {
        // Store the plaintext code (so admins can view/copy it from the list any
        // time) alongside the hash used for fast lookup on validate/accept.
        code,
        codeHash,
        targetRole: data.targetRole as Role, // checked by targetRoleRefusal above
        organizationId: data.organizationId,
        createdById: data.createdById,
        expiresAt: invitationExpiresAt(data.expiresInHours),
        ...invitationTargetFields(data, {
          inviteIsExternal,
          validMemberRoleId,
          externalSpacePermissions: externalGrant.spacePermissions,
          // Sanitized here, re-sanitized on accept. For non-admin creators, permission
          // flags are capped at the creator's own ceiling so the profile can't grant
          // more than the creator holds. Only read for a member invite.
          accessProfile:
            data.targetRole === Role.EMPLOYEE
              ? this.capAccessProfilePerms(normalizeAccessProfile(data.accessProfile), creatorIsAdmin, creatorPerms)
              : undefined,
        }),
      },
      include: {
        organization: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Invitation created for ${data.targetRole} in org ${data.organizationId} by ${data.createdById}`);

    if (data.email && data.email.trim()) {
      await this.emailInvitation(data, invitation, code, isCustomerInvite);
    }

    // Return the plain code to the creator (only available at creation time)
    return { success: true, data: createdInvitationView(invitation, code) };
  }

  /** A fresh code whose hash no invitation holds yet — null after five collisions. */
  private async uniqueInvitationCode(): Promise<{ code: string; codeHash: string } | null> {
    for (let attempts = 0; attempts < 5; attempts++) {
      const code = this.generateCode();
      const codeHash = hashCode(code);
      const existing = await this.prisma.invitation.findUnique({ where: { codeHash } });
      if (!existing) return { code, codeHash };
    }
    return null;
  }

  /**
   * Dynamic email invite: if an address was supplied, email the code + sign-in
   * link automatically (fire-and-forget — the invite already succeeded; a mail
   * hiccup must not fail the request, and the code is still shown in the UI).
   */
  private async emailInvitation(
    data: CreateInvitationInput,
    invitation: { organization: { name: string } | null; targetRole: string; expiresAt: Date },
    code: string,
    isCustomerInvite: boolean,
  ) {
    const email = data.email!.trim();
    // Outside the try: the lookup already turns a failure into English.
    const clientLocale = isCustomerInvite
      ? await this.clientInviteLocale(data.organizationId, email, data.customerId)
      : undefined;
    try {
      emitEvent(this.notificationClient, invitationCreatedEvent, {
        recipientEmail: email,
        // No name → the email says "your organization" in the reader's language.
        organizationName: invitation.organization?.name ?? null,
        invitationCode: code,
        targetRole: invitation.targetRole,
        expiresAt: invitation.expiresAt.toISOString(),
        // The inviter's language is the email's language when the address is
        // not already somebody's account.
        inviterId: data.createdById,
        // …except for a client, whose language is decided by the client rule.
        ...(clientLocale ? { locale: clientLocale } : {}),
      });
    } catch (e) {
      this.logger.warn(`Failed to queue invitation email to ${data.email}: ${e}`);
    }
  }
}
