import * as bcrypt from 'bcryptjs';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { hashCode, PrismaService } from '@hbcfield/shared';
import { BCRYPT_COST_FACTOR, normalizeAccessProfile, Role, normalizeEmail } from '@hbcfield/shared';
import {
  memberFieldsFromInvitation,
  claimInvitation,
  InvitationAlreadyClaimedError,
  applyInvitationPlacement,
} from './invitation-apply';
import { DocumentsService } from '../documents/documents.service';
import { BillingService } from '../billing/billing.service';

/** Using an invitation: checking a code, accepting it (and the joining contract it may carry). */
@Injectable()
export class InvitationAcceptService {
  private readonly logger = new Logger(InvitationAcceptService.name);

  constructor(
    private readonly prisma: PrismaService,
    // A local call, not a message: the contract belongs to the same service and
    // the same database as the member who just accepted.
    private readonly documents: DocumentsService,
    // Optional so a unit test that never adds a member need not wire billing.
    @Optional() private readonly billing?: BillingService,
  ) {}

  async validateCode(code: string) {
    const codeHashValue = hashCode(code.toUpperCase().trim());
    const invitation = await this.prisma.invitation.findUnique({
      where: { codeHash: codeHashValue },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return { valid: false, message: 'Invalid invitation code' };
    }

    if (invitation.status !== 'PENDING') {
      return { valid: false, message: 'This invitation has already been used or revoked' };
    }

    if (invitation.expiresAt < new Date()) {
      return { valid: false, message: 'This invitation has expired' };
    }

    return {
      valid: true,
      targetRole: invitation.targetRole,
      organizationName: invitation.organization.name,
      // What they are joining AS. Somebody invited by a client to supervise one
      // site should not be told they are joining as an employee of ours — it is
      // the first thing the product says to them, and it would be wrong.
      isExternal: invitation.isExternal,

      position: invitation.position,
      specialty: invitation.specialty,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Accept an invitation and register a new user.
   * Creates the user under the invitation's org with the specified role.
   */
  async acceptInvitation(data: { code: string; email: string; password: string; firstName: string; lastName: string }) {
    const codeHashValue = hashCode(data.code.toUpperCase().trim());

    // Find and validate invitation
    const invitation = await this.prisma.invitation.findUnique({
      where: { codeHash: codeHashValue },
      include: { organization: true },
    });

    if (!invitation) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid invitation code',
      };
    }

    if (invitation.status !== 'PENDING') {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This invitation has already been used or revoked',
      };
    }

    if (invitation.expiresAt < new Date()) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This invitation has expired',
      };
    }

    if (!invitation.organization.isActive) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The organization is no longer active',
      };
    }

    // Check email uniqueness
    const email = normalizeEmail(data.email);
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return {
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'An account with this email already exists',
      };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST_FACTOR);

    // Get default permissions for role
    const role = invitation.targetRole as Role;

    // Pre-configured Access Profile (EMPLOYEE only). When present it OVERRIDES the
    // role defaults, so the member's very first screen already matches their final
    // access. Re-sanitized here (never trust the stored JSON blindly).
    const accessProfile =
      invitation.targetRole === 'EMPLOYEE' ? normalizeAccessProfile(invitation.accessProfile) : null;

    // Create user and mark invitation as accepted in a transaction
    const user = await this.prisma
      .$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            organizationId: invitation.organizationId,
            // Every field the invitation dictates — the same mapping the mobile
            // onboarding path uses, so the two cannot drift again.
            ...memberFieldsFromInvitation(invitation, accessProfile),
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            organizationId: true,
            canCreateTasks: true,
            taskCreationScope: true,
            canViewAllTasks: true,
            canAssignTasks: true,
            canManageUsers: true,
            customerId: true,
            unitId: true,
            assetId: true,
          },
        });

        // The rota and the workspace the invitation dictates — the same function
        // the mobile onboarding path uses (invitation-apply.ts), members only.
        await applyInvitationPlacement(tx, invitation, newUser.id);

        // Claimed atomically, as the last write — see claimInvitation.
        await claimInvitation(tx, invitation.id, newUser.id);

        return newUser;
      })
      .catch((e: unknown) => {
        if (e instanceof InvitationAlreadyClaimedError) return null;
        throw e;
      });

    if (!user) {
      return {
        success: false as const,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This invitation has already been used or revoked',
      };
    }

    this.logger.log(`Invitation accepted: user ${user.id} joined org ${invitation.organizationId} as ${role}`);

    /*
      Their contract, if the organization has a template for this role.

      AFTER the transaction, and never inside it. Issuing renders a PDF and
      writes to object storage; doing that with the transaction open would hold
      a database lock across two network calls — the shape of problem that has
      already taken this system down once.

      Failing here does not fail the signup. Somebody has joined and can work; a
      contract that has not appeared yet is a thing an administrator can fix,
      whereas a signup that rolled back at the last step is not.
    */
    void this.issueJoiningContract(user.id, invitation.organizationId, invitation.createdById);

    // A new member is a new seat. Debounced, so a burst of joins is one sync.
    this.billing?.scheduleReconcile(invitation.organizationId);

    return {
      success: true,
      data: { user },
    };
  }

  /** Render and issue the contract that applies to a newly joined member. */
  private async issueJoiningContract(userId: string, organizationId: string, issuedById: string): Promise<void> {
    try {
      const template = await this.documents.resolveTemplateForMember(organizationId, userId);
      if (!template) return; // the organization has no contract templates — fine

      await this.documents.issueFromTemplate({
        actor: {
          userId: issuedById,
          organizationId,
          // The invitation's author is the issuer of record, which is truthful:
          // they chose the role, and the role chose the template.
          canViewMemberDocuments: true,
          canOpenMemberDocuments: false,
          canIssueDocuments: true,
          canManageDocumentTemplates: false,
        },
        userId,
        templateId: template.id,
      });
      this.logger.log(`Contract issued to ${userId} from template ${template.id}`);
    } catch (err) {
      this.logger.error(`Could not issue a joining contract to ${userId}: ${(err as Error).message}`);
    }
  }
}
