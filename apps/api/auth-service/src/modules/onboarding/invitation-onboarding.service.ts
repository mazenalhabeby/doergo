import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { SERVICE_NAMES, Role, DEFAULT_PERMISSIONS, normalizeAccessProfile, hashCode } from '@hbcfield/shared';
import {
  memberFieldsFromInvitation,
  claimInvitation,
  InvitationAlreadyClaimedError,
  applyInvitationPlacement,
} from '../invitations/invitation-apply';
import { orphanUser } from './orphan-user';

/** An existing account accepting an invitation code during onboarding. */
@Injectable()
export class InvitationOnboardingService {
  private readonly logger = new Logger(InvitationOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Path C: Accept an invitation code as an existing (orphan) user.
   */
  async acceptInvitationForExistingUser(userId: string, code: string) {
    const orphan = await orphanUser(this.prisma, userId);
    if ('refusal' in orphan) return orphan.refusal;

    // Validate invitation
    const codeHashValue = hashCode(code.toUpperCase().trim());
    const invitation = await this.prisma.invitation.findUnique({
      where: { codeHash: codeHashValue },
      include: { organization: true },
    });

    if (!invitation) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid invitation code' };
    }

    if (invitation.status !== 'PENDING') {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This invitation has already been used or revoked',
      };
    }

    if (invitation.expiresAt < new Date()) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'This invitation has expired' };
    }

    if (!invitation.organization.isActive) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'The organization is no longer active' };
    }

    const role = invitation.targetRole as Role;
    const defaultPerms = DEFAULT_PERMISSIONS[role];
    const isTechnician = role === Role.EMPLOYEE;

    // Pre-configured Access Profile (EMPLOYEE only) — when the admin set access on
    // the invite it OVERRIDES the role defaults, exactly like the web/register
    // accept path (invitation.service.acceptInvitation). Without this, a member who
    // onboards through the MOBILE flow lands on role defaults and every pre-set
    // permission / enabledModules / memberRoleId is silently dropped.
    const accessProfile = isTechnician ? normalizeAccessProfile(invitation.accessProfile) : null;

    const result = await this.prisma
      .$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            organizationId: invitation.organizationId,
            onboardingCompleted: true,
            /*
            Every field the invitation dictates, from the one mapping the
            register path also uses. Written out by hand here until now — and it
            drifted: `isExternal` reached the other copy and this one kept
            turning external invitations into ordinary employees, with no error
            anywhere to notice. The comment above about pre-set access being
            "silently dropped" on this path was a warning; this is a mechanism.
          */
            ...memberFieldsFromInvitation(invitation, accessProfile, {
              // This path has always defaulted an unset position; the register
              // path has always left it null. Preserved rather than unified, so
              // neither flow starts producing something different today.
              defaultPosition: 'technician',
            }),
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            organizationId: true,
            onboardingCompleted: true,
            customerId: true,
            unitId: true,

            canCreateTasks: true,
            taskCreationScope: true,
            canViewAllTasks: true,
            canAssignTasks: true,
            canManageUsers: true,
          },
        });

        // The rota and the workspace the invitation dictates — one function for
        // both accept paths (invitation-apply.ts), with the member-only gate
        // stated there rather than repeated here.
        await applyInvitationPlacement(tx, invitation, userId);

        // Customer portal: the resident owns their identity. Sync the Customer
        // record's name from the account they just registered, so the office
        // dashboard (which reads Customer.name) and the app show the same name.
        if (role === Role.CUSTOMER && invitation.customerId) {
          const fullName = [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' ').trim();
          if (fullName) {
            await tx.customer.update({
              where: { id: invitation.customerId },
              data: { name: fullName },
            });
          }
        }

        // Claimed atomically, as the last write — see claimInvitation.
        await claimInvitation(tx, invitation.id, userId);

        return updatedUser;
      })
      .catch((e: unknown) => {
        if (e instanceof InvitationAlreadyClaimedError) return null;
        throw e;
      });

    if (!result) {
      return {
        success: false as const,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'This invitation has already been used or revoked',
      };
    }

    this.logger.log(`Invitation accepted by existing user ${userId} → org ${invitation.organizationId} as ${role}`);
    // A new member is a new seat. Debounced, so a burst of joins is one sync.
    this.billing.scheduleReconcile(invitation.organizationId);

    return { success: true, data: { user: result } };
  }
}
