import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { SERVICE_NAMES, clampListLimit } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { BillingService } from '../billing/billing.service';
import {
  BCRYPT_COST_FACTOR,
  DEFAULT_PERMISSIONS,
  normalizeAccessProfile,
  Role,
  INVITATION_CODE_LENGTH,
  INVITATION_CODE_CHARSET,
  INVITATION_DEFAULT_EXPIRY_HOURS,
  INVITATION_MAX_EXPIRY_HOURS,
  INVITATION_MIN_EXPIRY_HOURS,
  INVITATION_MAX_PENDING_PER_ORG,
  permissionsFromOrgRole,
  mergePermissions,
  permissionsExceed,
  mayGrantBaseRole,
  loadOrgPermissionCeiling,
  loadSpacePermissionCeiling,
  externalForbiddenIn,
  whitelistPermissions,
  SPACE_PERMISSION_KEYS,
  SHARED_ROLE_WHERE,
  PERMISSION_KEYS,
  type PermissionSet,
  normalizeEmail,
  clientEmailLocale,
  DEFAULT_LOCALE,
  type SupportedLocale,
} from '@hbcfield/shared';
import { memberFieldsFromInvitation, claimInvitation, InvitationAlreadyClaimedError, applyInvitationPlacement } from './invitation-apply';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notificationClient: ClientProxy,
    // A local call, not a message: the contract belongs to the same service and
    // the same database as the member who just accepted.
    private readonly documents: DocumentsService,
    // Optional so a unit test that never adds a member need not wire billing.
    @Optional() private readonly billing?: BillingService,
  ) {}

  /**
   * The language a CLIENT's invitation is written in — the client rule
   * (`clientEmailLocales`): their own account, the client record, the
   * organization, English.
   *
   * Decided HERE and sent with the event, because this is the service that can
   * read the client record, and because notification-service's fallback for an
   * address — the inviting member's language — is the wrong one for a client:
   * the member who pressed "invite" writing German says nothing about what the
   * client reads. A failed lookup is English, never "let the inviter decide".
   */
  private async clientInviteLocale(
    organizationId: string,
    email: string,
    customerId: string | null | undefined,
  ): Promise<SupportedLocale> {
    try {
      return await clientEmailLocale(this.prisma, organizationId, { email, customerId });
    } catch (e) {
      this.logger.warn(`Could not look up a language for a client invitation: ${e}`);
      return DEFAULT_LOCALE;
    }
  }

  /**
   * Cap an Access Profile's permission flags at the creator's ceiling. For a true
   * admin the profile passes through unchanged; otherwise any permission flag the
   * creator does not hold is forced false, so an invite can never grant more than
   * its creator (privilege escalation via the Access Profile).
   */
  private capAccessProfilePerms(
    profile: ReturnType<typeof normalizeAccessProfile>,
    isAdmin: boolean,
    creatorPerms: Record<string, boolean | undefined>,
  ): ReturnType<typeof normalizeAccessProfile> {
    if (!profile || isAdmin) return profile;
    const canCreateTasks = profile.canCreateTasks && creatorPerms.canCreateTasks === true;
    return {
      ...profile,
      canCreateTasks,
      taskCreationScope: canCreateTasks ? profile.taskCreationScope : 'NONE',
      canAssignTasks: profile.canAssignTasks && creatorPerms.canAssignTasks === true,
      canViewAllTasks: profile.canViewAllTasks && creatorPerms.canViewAllTasks === true,
      canManageUsers: profile.canManageUsers && creatorPerms.canManageUsers === true,
      canViewReports: profile.canViewReports && creatorPerms.canViewReports === true,
    };
  }

  /**
   * Generate a short alphanumeric code using secure randomness.
   * Uses a charset that excludes confusing characters (I, O, 0, 1).
   */
  private generateCode(): string {
    const bytes = randomBytes(INVITATION_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < INVITATION_CODE_LENGTH; i++) {
      code += INVITATION_CODE_CHARSET[bytes[i] % INVITATION_CODE_CHARSET.length];
    }
    return code;
  }

  /**
   * Create a new invitation.
   * ADMIN can invite DISPATCHER or TECHNICIAN.
   * DISPATCHER can only invite TECHNICIAN.
   */
  async createInvitation(data: {
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
    // When present, the invite code is ALSO emailed to this address automatically.
    email?: string;
  }) {
    const isCustomerInvite = data.targetRole === Role.CUSTOMER;

    // Non-admin creators may only invite employees (never admins or customers).
    // The same rule join-request approval asks (`mayGrantBaseRole`).
    if (!mayGrantBaseRole(data.creatorRole, data.targetRole)) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'You can only invite employees',
      };
    }

    // Cannot invite ADMIN role (one admin per org via self-registration)
    if (data.targetRole === Role.ADMIN) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Cannot create invitations for ADMIN role',
      };
    }

    // Target role must be EMPLOYEE or CUSTOMER (ADMIN already blocked above).
    if (data.targetRole !== Role.EMPLOYEE && !isCustomerInvite) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Target role must be EMPLOYEE or CUSTOMER',
      };
    }

    // Customer invites must name an existing Customer in this org (fail closed).
    if (isCustomerInvite) {
      if (!data.customerId) {
        return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'customerId is required for a customer invite' };
      }
      const customer = await this.prisma.customer.findFirst({
        where: { id: data.customerId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!customer) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Customer not found in this organization' };
      }
      if (data.unitId) {
        const unit = await this.prisma.customerUnit.findFirst({
          where: { id: data.unitId, organizationId: data.organizationId },
          select: { id: true },
        });
        if (!unit) {
          return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Unit not found in this organization' };
        }
      }
      // Same check for an asset: an id from another tenant must not become the
      // place a login is confined to.
      if (data.assetId) {
        const asset = await this.prisma.asset.findFirst({
          where: { id: data.assetId, organizationId: data.organizationId },
          select: { id: true },
        });
        if (!asset) {
          return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Asset not found in this organization' };
        }
      }
    }

    // Resolve the creator's OWN effective org permissions once (non-admins only).
    // Used as the ceiling for both a pre-assigned role and the Access Profile flags,
    // so a non-admin can never mint an account more privileged than themselves.
    let creatorPerms: ReturnType<typeof mergePermissions> = {};
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
    let externalGrant: { memberRoleId: string | null; spacePermissions: PermissionSet | null } = { memberRoleId: null, spacePermissions: null };
    if (inviteIsExternal || data.spacePermissions != null) {
      const checked = await this.checkExternalSpaceGrant(data, creatorIsAdmin, inviteIsExternal);
      if ('refusal' in checked) return checked.refusal;
      externalGrant = checked;
    }

    // Validate a pre-assigned org role (EMPLOYEE invites only): must be an
    // active ORG/BOTH-scoped role in THIS org. Fail closed — never trust the id.
    let validMemberRoleId: string | null = externalGrant.memberRoleId;
    // Staff only: an external member's role was settled above (a SPACE role, never an org one).
    if (data.memberRoleId && data.targetRole === Role.EMPLOYEE && !inviteIsExternal) {
      const role = await this.prisma.accessRole.findFirst({
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
        return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid role' };
      }
      // Ceiling guard: a non-admin creator cannot pre-assign a role that grants
      // more than they hold (privilege escalation via invitation pre-assignment).
      if (!creatorIsAdmin) {
        const targetRole = await this.prisma.accessRole.findFirst({
          where: { id: role.id, organizationId: data.organizationId },
          select: { permissions: true },
        });
        if (permissionsExceed(creatorPerms, permissionsFromOrgRole(targetRole?.permissions))) {
          return {
            success: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'You cannot assign a role with permissions beyond your own',
          };
        }
      }
      validMemberRoleId = role.id;
    }

    // Check pending invitation count for org
    const pendingCount = await this.prisma.invitation.count({
      where: { organizationId: data.organizationId, status: 'PENDING' },
    });
    if (pendingCount >= INVITATION_MAX_PENDING_PER_ORG) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Maximum pending invitations (${INVITATION_MAX_PENDING_PER_ORG}) reached for this organization`,
      };
    }

    // Generate unique code with collision retry
    let code: string = '';
    let codeHashValue: string = '';
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      code = this.generateCode();
      codeHashValue = hashCode(code);
      const existing = await this.prisma.invitation.findUnique({
        where: { codeHash: codeHashValue },
      });
      if (!existing) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      this.logger.error('Failed to generate unique invitation code after max attempts');
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to generate unique invitation code. Please try again.',
      };
    }

    // Calculate expiry
    const expiresInHours = Math.min(
      Math.max(data.expiresInHours || INVITATION_DEFAULT_EXPIRY_HOURS, INVITATION_MIN_EXPIRY_HOURS),
      INVITATION_MAX_EXPIRY_HOURS,
    );
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const isTechnician = data.targetRole === Role.EMPLOYEE;

    const invitation = await this.prisma.invitation.create({
      data: {
        // Store the plaintext code (so admins can view/copy it from the list any
        // time) alongside the hash used for fast lookup on validate/accept.
        code,
        codeHash: codeHashValue,
        targetRole: data.targetRole as any,
        organizationId: data.organizationId,
        createdById: data.createdById,
        expiresAt,

        // Job title (e.g. "Plumber"). Blank → null, NOT a work-mode value.
        position: isTechnician ? (data.position?.trim() || null) : null,
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
        scheduleType: isTechnician && !inviteIsExternal ? (data.scheduleType || null) : null,
        schedule: isTechnician && !inviteIsExternal && data.scheduleType === 'FIXED' && data.schedule?.length
          ? (data.schedule as any)
          : undefined,
        monthlyHourBudget: isTechnician && !inviteIsExternal && data.scheduleType === 'FLEXIBLE'
          ? (data.monthlyHourBudget ?? null)
          : null,
        specialty: isTechnician ? data.specialty || null : null,
        maxDailyJobs: isTechnician ? data.maxDailyJobs || null : null,
        // Pre-assigned space — applied to the user on accept.
        spaceId: isTechnician ? (data.spaceId || null) : null,
        // Pre-assigned org role (validated above) — applied to the user on accept.
        memberRoleId: isTechnician ? validMemberRoleId : null,
        // Who they work for. Only meaningful on a member invite.
        isExternal: isTechnician ? inviteIsExternal : false,
        // Their permissions in `spaceId`, validated above; applied on accept (see applyInvitationPlacement).
        spacePermissions: isTechnician && externalGrant.spacePermissions
          ? (externalGrant.spacePermissions as Prisma.InputJsonValue)
          : undefined,
        // Pre-configured Access Profile — sanitized here, re-sanitized on accept.
        // For non-admin creators, permission flags are capped at the creator's own
        // ceiling so the profile can't grant more than the creator holds.
        accessProfile: isTechnician
          ? ((this.capAccessProfilePerms(
              normalizeAccessProfile(data.accessProfile),
              creatorIsAdmin,
              creatorPerms,
            ) as unknown as Prisma.InputJsonValue) ?? undefined)
          : undefined,
        // Customer-portal invite target (bound to the new login on accept).
        customerId: isCustomerInvite ? (data.customerId || null) : null,
        unitId: isCustomerInvite ? (data.unitId || null) : null,
        assetId: isCustomerInvite ? (data.assetId || null) : null,
      },
      include: {
        organization: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.logger.log(`Invitation created for ${data.targetRole} in org ${data.organizationId} by ${data.createdById}`);

    // Dynamic email invite: if an address was supplied, email the code + sign-in
    // link automatically (fire-and-forget — the invite already succeeded; a mail
    // hiccup must not fail the request, and the code is still shown in the UI).
    if (data.email && data.email.trim()) {
      // Outside the try: the lookup already turns a failure into English.
      const clientLocale = isCustomerInvite
        ? await this.clientInviteLocale(data.organizationId, data.email.trim(), data.customerId)
        : undefined;
      try {
        this.notificationClient.emit('invitation_created', {
          recipientEmail: data.email.trim(),
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

    // Return the plain code to the creator (only available at creation time)
    return {
      success: true,
      data: {
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
      },
    };
  }

  /**
   * What an EXTERNAL invitation may hand its invitee in its workspace — a
   * shared SPACE role (`memberRoleId`) or a set of keys (`spacePermissions`),
   * never both, never an org role and never somebody's personal role.
   *
   * Three checks, the same ones the permission builder's writer applies on the
   * member: workspace keys only (an org key set to true is refused, not
   * dropped), the external allow-list, and the inviter's own ceiling IN THAT
   * WORKSPACE (org grants ∪ their assignment there). The ceiling on a named
   * space role is new: it was missing, so a member manager could invite an
   * outsider straight into a role above their own.
   */
  private async checkExternalSpaceGrant(
    data: { organizationId: string; createdById: string; targetRole: string; spaceId?: string; memberRoleId?: string; spacePermissions?: unknown },
    creatorIsAdmin: boolean,
    inviteIsExternal: boolean,
  ): Promise<
    | { memberRoleId: string | null; spacePermissions: PermissionSet | null }
    | { refusal: { success: false; statusCode: number; message: string; code?: string; params?: Record<string, unknown> } }
  > {
    const refuse = (statusCode: number, message: string, code?: string, params?: Record<string, unknown>) => ({
      refusal: { success: false as const, statusCode, message, ...(code ? { code } : {}), ...(params ? { params } : {}) },
    });
    const hasKeys = data.spacePermissions != null;
    if (hasKeys && (!inviteIsExternal || data.targetRole !== Role.EMPLOYEE)) {
      return refuse(HttpStatus.BAD_REQUEST, 'Workspace permissions are for an external member', 'SPACE_PERMISSIONS_EXTERNAL_ONLY');
    }
    if (hasKeys && data.memberRoleId) {
      return refuse(HttpStatus.BAD_REQUEST, 'Send either a role or a set of permissions', 'PERMISSIONS_CHOICE_INVALID');
    }

    // The ceiling the inviter grants within: their workspace ceiling when the invite names one.
    const ceilingOf = async (): Promise<PermissionSet | null> => {
      if (creatorIsAdmin) return null;
      const c = data.spaceId
        ? await loadSpacePermissionCeiling(this.prisma, data.createdById, data.organizationId, data.spaceId)
        : await loadOrgPermissionCeiling(this.prisma, data.createdById, data.organizationId);
      if (c?.isAdmin) return null;
      return c?.perms ?? {};
    };
    const checkGrant = async (perms: PermissionSet) => {
      const forbidden = externalForbiddenIn(perms);
      if (forbidden.length) {
        return refuse(HttpStatus.BAD_REQUEST, 'An external member cannot be given these permissions', 'EXTERNAL_PERMISSION_FORBIDDEN', { keys: forbidden });
      }
      const ceiling = await ceilingOf();
      if (ceiling && permissionsExceed(ceiling, perms)) {
        const over = PERMISSION_KEYS.filter((k) => perms[k] === true && ceiling[k] !== true);
        return refuse(HttpStatus.FORBIDDEN, 'You cannot grant permissions beyond your own', 'GRANT_EXCEEDS_OWN', { keys: over });
      }
      return null;
    };

    if (hasKeys) {
      // Permissions in a workspace need the workspace — one of THIS organization, still open.
      if (!data.spaceId) {
        return refuse(HttpStatus.BAD_REQUEST, 'Choose the workspace these permissions are for', 'SPACE_PERMISSIONS_NEED_SPACE');
      }
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId, isActive: true },
        select: { id: true },
      });
      if (!space) return refuse(HttpStatus.NOT_FOUND, 'Workspace not found');
      const raw = data.spacePermissions;
      if (typeof raw !== 'object' || Array.isArray(raw)) {
        return refuse(HttpStatus.BAD_REQUEST, 'Permissions must be an object of keys', 'PERMISSION_KEY_NOT_IN_SPACE');
      }
      // Refused as a whole, never filtered: a dropped key reads as granted on the screen that sent it.
      const spaceKeys = new Set<string>(SPACE_PERMISSION_KEYS);
      const wrong = Object.entries(raw as Record<string, unknown>)
        .filter(([k, v]) => typeof v !== 'boolean' || (v === true && !spaceKeys.has(k)))
        .map(([k]) => k);
      if (wrong.length) {
        return refuse(HttpStatus.BAD_REQUEST, 'These permissions cannot be given in a workspace', 'PERMISSION_KEY_NOT_IN_SPACE', { keys: wrong });
      }
      const perms = whitelistPermissions(raw, 'space');
      if (!Object.keys(perms).length) {
        // An outsider holding nothing signs in to empty screens — the failure this field exists to prevent.
        return refuse(HttpStatus.BAD_REQUEST, 'Give this person at least one permission', 'SPACE_PERMISSIONS_EMPTY');
      }
      const problem = await checkGrant(perms);
      if (problem) return problem;
      return { memberRoleId: null, spacePermissions: perms };
    }

    /*
      An external invitation may name a role — it must simply be a SHARED SPACE
      role (never an org role, never one person's personal role, never a trade).

      There are two kinds of outsider: a Supervisor who approves our hours and
      follows the work, and an Observer who watches and can raise a job. Which
      one they are is the whole difference between them, so it is chosen when
      they are invited rather than corrected afterwards.

      The value lands on their SPACE ASSIGNMENT, never on `User.memberRoleId` —
      `memberFieldsFromInvitation` forces that null for an external member, so
      the org-wide field cannot be reached even if this validation were wrong.

      ⚠️ It used to be validated here and then looked up AGAIN as an org role,
      which refused every space role with "Invalid role" — an external
      invitation could only ever arrive with the default role.
    */
    if (data.memberRoleId) {
      const spaceRole = await this.prisma.accessRole.findFirst({
        where: {
          id: data.memberRoleId,
          organizationId: data.organizationId,
          isActive: true,
          scope: 'SPACE',
          kind: { not: 'WORK' },
          ...SHARED_ROLE_WHERE,
        },
        select: { id: true, permissions: true },
      });
      if (!spaceRole) return refuse(HttpStatus.BAD_REQUEST, 'An external member can only be given a workspace role');
      const problem = await checkGrant(permissionsFromOrgRole(spaceRole.permissions));
      if (problem) return problem;
      return { memberRoleId: spaceRole.id, spacePermissions: null };
    }
    return { memberRoleId: null, spacePermissions: null };
  }

  /**
   * Validate an invitation code (public endpoint).
   * Returns org name and target role if valid.
   */
  /**
   * Re-send the pending invite for a portal client by email (uses the stored
   * plaintext code — no new code minted). Org-scoped; requires the client to have
   * an email and a PENDING invitation.
   */
  async resendInvitation(data: { organizationId: string; customerId: string }) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { customerId: data.customerId, organizationId: data.organizationId, status: 'PENDING' },
      include: { organization: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!invitation) {
      return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'No pending invitation for this client' };
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, organizationId: data.organizationId },
      select: { email: true },
    });
    if (!customer?.email) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'This client has no email address' };
    }
    this.notificationClient.emit('invitation_created', {
      recipientEmail: customer.email,
      organizationName: invitation.organization?.name ?? null,
      invitationCode: invitation.code,
      targetRole: invitation.targetRole,
      expiresAt: invitation.expiresAt.toISOString(),
      // Whoever created the invitation, not whoever pressed "resend": the
      // resend carries no caller, and the creator is who chose this client.
      inviterId: invitation.createdById,
      // A portal invitation always names its client, so the client rule decides.
      locale: await this.clientInviteLocale(data.organizationId, customer.email, data.customerId),
    });
    return { success: true, data: { sentTo: customer.email } };
  }

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
  async acceptInvitation(data: {
    code: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
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
    const defaultPerms = DEFAULT_PERMISSIONS[role];

    // Pre-configured Access Profile (EMPLOYEE only). When present it OVERRIDES the
    // role defaults, so the member's very first screen already matches their final
    // access. Re-sanitized here (never trust the stored JSON blindly).
    const accessProfile =
      invitation.targetRole === 'EMPLOYEE'
        ? normalizeAccessProfile(invitation.accessProfile)
        : null;

    // Create user and mark invitation as accepted in a transaction
    const user = await this.prisma.$transaction(async (tx) => {
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
    }).catch((e: unknown) => {
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
  private async issueJoiningContract(
    userId: string,
    organizationId: string,
    issuedById: string,
  ): Promise<void> {
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
      this.logger.error(
        `Could not issue a joining contract to ${userId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * List invitations for an organization with pagination.
   */
  async listInvitations(data: {
    organizationId: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page || 1;
    const limit = clampListLimit(data.limit, 10, 50);
    const skip = (page - 1) * limit;

    const where: any = { organizationId: data.organizationId };
    if (data.status && data.status !== 'all') {
      where.status = data.status;
    }

    const [invitations, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invitation.count({ where }),
    ]);

    // Auto-expire pending invitations that are past their expiry
    const now = new Date();
    const formatted = invitations.map((inv) => ({
      ...inv,
      // Override status for display if expired but still marked PENDING
      status: inv.status === 'PENDING' && inv.expiresAt < now ? 'EXPIRED' : inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      usedAt: inv.usedAt?.toISOString() || null,
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    }));

    return {
      success: true,
      data: formatted,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Revoke an invitation (mark as REVOKED).
   */
  async revokeInvitation(data: {
    invitationId: string;
    organizationId: string;
    userId: string;
  }) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: data.invitationId },
    });

    if (!invitation) {
      return {
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Invitation not found',
      };
    }

    if (invitation.organizationId !== data.organizationId) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Not authorized to revoke this invitation',
      };
    }

    if (invitation.status !== 'PENDING') {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot revoke an invitation with status: ${invitation.status}`,
      };
    }

    await this.prisma.invitation.update({
      where: { id: data.invitationId },
      data: { status: 'REVOKED' },
    });

    this.logger.log(`Invitation ${data.invitationId} revoked by user ${data.userId}`);

    return {
      success: true,
      message: 'Invitation revoked successfully',
    };
  }
}
