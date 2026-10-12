import { Prisma, Role as PrismaRole } from '@prisma/client';
import { defaultSpaceRoleId } from './invitation-space-role';
import {
  DEFAULT_PERMISSIONS,
  Role,
  getDefaultModules,
  externalMayHold,
  filterExternalModules,
  type AccessPersisted,
  whitelistPermissions,
  externalForbiddenIn,
  loadSpacePermissionCeiling,
  setAssignmentPermissions,
  PERMISSION_KEYS,
  type PermissionSet,
} from '@hbcfield/shared';

/**
 * The member fields an invitation dictates — one mapping, two doors.
 *
 * An invitation is accepted through two entirely separate paths: registering a
 * new account with the code (`InvitationService.acceptInvitation`), and an
 * existing orphan account using the code during mobile onboarding
 * (`OnboardingService.acceptInvitationForExistingUser`). Both wrote this same
 * object out by hand, and the second one drifted: `isExternal` was added to the
 * first and the mobile flow kept producing ordinary employees from external
 * invitations, silently and with no error anywhere.
 *
 * That copy already carried a comment warning that pre-set permissions get
 * "silently dropped" on this path. A warning is not a mechanism. This is.
 *
 * Pure: takes the invitation row, returns a data patch. The two callers still
 * own their own transaction, their own create-vs-update, and the fields that
 * genuinely differ (email, password hash, names).
 */
interface InvitationFieldsSource {
  targetRole: PrismaRole;
  position: string | null;
  specialty: string | null;
  maxDailyJobs: number | null;
  scheduleType: string | null;
  monthlyHourBudget: number | null;
  memberRoleId: string | null;
  isExternal: boolean;
  customerId?: string | null;
  unitId?: string | null;
}

export function memberFieldsFromInvitation(
  invitation: InvitationFieldsSource,
  accessProfile: AccessPersisted | null,
  opts?: { defaultPosition?: string | null },
  // `role` is named in the return type because Prisma's create requires it, and
  // a bare Record hides that it is always set.
): { role: PrismaRole } & Record<string, unknown> {
  const role = invitation.targetRole as Role;
  const defaultPerms = DEFAULT_PERMISSIONS[role];
  const isMember = invitation.targetRole === 'EMPLOYEE';

  const base: { role: PrismaRole } & Record<string, unknown> = {
    role: invitation.targetRole,
    canCreateTasks: defaultPerms.canCreateTasks,
    taskCreationScope: defaultPerms.taskCreationScope,
    canViewAllTasks: defaultPerms.canViewAllTasks,
    canAssignTasks: defaultPerms.canAssignTasks,
    canManageUsers: defaultPerms.canManageUsers,
  };

  if (isMember) {
    Object.assign(base, {
      // The register path leaves an unset position null; the mobile path used
      // to default it to 'technician'. Kept as a caller option rather than
      // quietly picking one, because changing either would change what an
      // existing flow produces.
      position: invitation.position || opts?.defaultPosition || null,
      specialty: invitation.specialty,
      maxDailyJobs: invitation.maxDailyJobs || 5,
      // An external member has no schedule: their hours are their own
      // employer's business, and a rota line for somebody who never appears
      // raises no-shows against a company that owes us no attendance.
      scheduleType: invitation.isExternal ? 'NONE' : invitation.scheduleType || 'NONE',
      monthlyHourBudget: invitation.isExternal ? null : invitation.monthlyHourBudget ?? null,
      // Never an org-wide role for an external member — refused at invite time,
      // and forced null here so an invitation predating that rule, or edited
      // underneath it, cannot deliver one.
      memberRoleId: invitation.isExternal ? null : invitation.memberRoleId ?? null,
      isExternal: invitation.isExternal,
    });

    if (accessProfile) {
      // Pre-configured access OVERRIDES the role defaults, so the member's very
      // first screen already matches their final access.
      Object.assign(base, {
        enabledModules: accessProfile.enabledModules,
        canCreateTasks: accessProfile.canCreateTasks,
        taskCreationScope: accessProfile.taskCreationScope as any,
        canAssignTasks: accessProfile.canAssignTasks,
        canViewAllTasks: accessProfile.canViewAllTasks,
        canManageUsers: accessProfile.canManageUsers,
        contactable: accessProfile.contactable,
        contactScope: accessProfile.contactScope,
        contactAllowedIds: accessProfile.contactAllowedIds,
        canViewReports: accessProfile.canViewReports,
        allowRemote: accessProfile.allowRemote,
      });
    } else {
      // No pre-config → LEAST PRIVILEGE: their own assigned spaces only.
      Object.assign(base, {
        enabledModules: {
          modules: getDefaultModules(invitation.position),
          spaceScope: 'own',
        },
      });
    }

    if (invitation.isExternal) {
      /*
        Applied LAST so it wins over the role defaults AND a pre-configured
        access profile, whichever set them. Read from the shared allow-list
        rather than written out, so allowing one of these to external members
        later is a one-line change in one file and this follows it.
      */
      Object.assign(base, {
        canManageUsers: externalMayHold('canManageUsers'),
        canViewReports: externalMayHold('canViewReports'),
      });
      /*
        And no `clock` or `time_off` in their module list, whatever the invite
        carried. Both describe an employment we do not have with them: clocking
        in records hours WE owe payment for, a vacation request asks US for
        leave. Same rule the member-edit path applies on save.
      */
      const current = base.enabledModules as { modules?: unknown } | unknown[] | undefined;
      if (Array.isArray(current)) {
        base.enabledModules = filterExternalModules(current);
      } else if (current && typeof current === 'object') {
        base.enabledModules = { ...current, modules: filterExternalModules(current.modules) };
      }
    }
  }

  if (role === Role.CUSTOMER) {
    // Portal login: bound to its Customer + optional unit so the portal scopes.
    Object.assign(base, {
      customerId: invitation.customerId ?? null,
      unitId: invitation.unitId ?? null,
    });
  }

  return base;
}

/**
 * Thrown inside an accept transaction when the invitation was no longer
 * PENDING at the moment of the claim — rolls the whole accept back.
 */
export class InvitationAlreadyClaimedError extends Error {
  constructor() {
    super('This invitation has already been used or revoked');
    this.name = 'InvitationAlreadyClaimedError';
  }
}

/**
 * CLAIM an invitation for the member who just accepted it — inside the accept
 * transaction, as its last write.
 *
 * Both accept paths used to read "status = PENDING" up front and write
 * ACCEPTED at the end: two people holding the same code at the same instant
 * both passed the read and both joined, on a code meant for one. This is a
 * conditional update on PENDING; Postgres re-checks the condition after the
 * row lock, so exactly one transaction gets count 1 and the other throws,
 * rolling back the account it had just made.
 */
export async function claimInvitation(
  tx: { invitation: { updateMany(args: any): Promise<{ count: number }> } },
  invitationId: string,
  acceptedById: string,
): Promise<void> {
  const claim = await tx.invitation.updateMany({
    where: { id: invitationId, status: 'PENDING', expiresAt: { gt: new Date() } },
    data: { status: 'ACCEPTED', usedAt: new Date(), acceptedById },
  });
  if (claim.count !== 1) throw new InvitationAlreadyClaimedError();
}

/** What an invitation row must carry for `applyInvitationPlacement`. */
interface InvitationPlacementSource {
  organizationId: string;
  targetRole: PrismaRole | string;
  isExternal: boolean;
  memberRoleId: string | null;
  spaceId: string | null;
  scheduleType: string | null;
  schedule: unknown;
  /** What an external invitee may do in `spaceId` (the permission builder); null = role / default. */
  spacePermissions?: unknown;
  /** Who made the invitation — their CURRENT ceiling in the workspace caps the grant on accept. */
  createdById?: string | null;
}

/**
 * The invitation's `spacePermissions` as they may be granted NOW — checked
 * again on accept, possibly weeks after the invitation was made.
 *
 * It only ever NARROWS: workspace keys, minus anything the external allow-list
 * no longer permits, minus anything the inviter no longer holds there. A
 * refusal at this point would strand somebody holding a valid code with an
 * account that is in no workspace, so the grant shrinks instead — and a grant
 * that shrinks to nothing is no role at all, never the (wider) default role.
 */
export async function invitationSpaceGrantNow(
  tx: Prisma.TransactionClient,
  invitation: InvitationPlacementSource,
): Promise<PermissionSet> {
  const perms = whitelistPermissions(invitation.spacePermissions, 'space');
  for (const k of externalForbiddenIn(perms)) delete perms[k];
  if (invitation.createdById && invitation.spaceId) {
    const ceiling = await loadSpacePermissionCeiling(tx as any, invitation.createdById, invitation.organizationId, invitation.spaceId);
    if (!ceiling) return {}; // the inviter has left the organization: nothing they granted stands
    if (!ceiling.isAdmin) {
      for (const k of PERMISSION_KEYS) if (perms[k] === true && ceiling.perms[k] !== true) delete perms[k];
    }
  }
  return perms;
}

/**
 * Who an invitation PLACES — a weekly rota and a workspace.
 *
 * Only a member (EMPLOYEE). Stated here as the gate rather than left to how the
 * invitation happened to be created: the register path relied on `create`
 * never storing a schedule or a space for anybody else, the mobile path checked
 * the role itself. A portal client given a rota raises no-shows; an admin needs
 * no placement to reach everything.
 */
export function invitationPlacesMember(targetRole: PrismaRole | string): boolean {
  return targetRole === 'EMPLOYEE';
}

/**
 * The rota and the workspace an accepted invitation dictates — one function,
 * both accept paths (`InvitationService.acceptInvitation`,
 * `OnboardingService.acceptInvitationForExistingUser`). Each wrote this out by
 * hand; two copies of the same placement is how `isExternal` went missing from
 * one of them before. Runs inside the caller's accept transaction.
 *
 * ⚠️ OWNERSHIP, by decision: `technicianSchedule` and `spaceAssignment` belong to
 * task-service and are the ONE place auth-service writes them. Joining is the
 * account, the invitation claim and the placement together — moved behind a
 * message, a task-service outage would create an account that is in no workspace
 * with a code already spent, which nothing on screen explains or repairs. Leaving
 * has no such constraint and goes through `member_offboard`.
 */
export async function applyInvitationPlacement(
  tx: Prisma.TransactionClient,
  invitation: InvitationPlacementSource,
  userId: string,
): Promise<void> {
  if (!invitationPlacesMember(invitation.targetRole)) return;

  // Pre-set weekly schedule (FIXED invites). Owner: task-service (see above).
  if (invitation.scheduleType === 'FIXED' && Array.isArray(invitation.schedule)) {
    const rows = (invitation.schedule as any[]).filter(
      (r) => r && typeof r.dayOfWeek === 'number' && r.startTime && r.endTime,
    );
    if (rows.length > 0) {
      await tx.technicianSchedule.createMany({
        data: rows.map((r) => ({
          technicianId: userId,
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
          isActive: r.isActive ?? true,
        })),
      });
    }
  }

  // Pre-assigned space, if it still exists in the org. Owner: task-service.
  if (!invitation.spaceId) return;
  const space = await tx.companyLocation.findFirst({
    where: { id: invitation.spaceId, organizationId: invitation.organizationId, isActive: true },
    select: { id: true },
  });
  if (!space) return;
  // Permissions built for this person (external only): granted below through the builder's own writer.
  const built = invitation.isExternal && invitation.spacePermissions != null;
  const existing = built
    ? await tx.spaceAssignment.findUnique({
        where: { userId_spaceId: { userId, spaceId: invitation.spaceId } },
        select: { id: true },
      })
    : null;
  // An external member's authority is their SPACE role and nothing else; an
  // internal member's org role is never copied here (see defaultSpaceRoleId).
  // Only on create — `update` deliberately leaves an existing roleId alone.
  const roleId = built
    ? null
    : await defaultSpaceRoleId(tx, invitation.organizationId, {
        isExternal: invitation.isExternal,
        chosenRoleId: invitation.memberRoleId,
      });
  const assignment = await tx.spaceAssignment.upsert({
    where: { userId_spaceId: { userId, spaceId: invitation.spaceId } },
    update: { isPrimary: true, effectiveTo: null },
    create: { organizationId: invitation.organizationId, userId, spaceId: invitation.spaceId, isPrimary: true, roleId },
    select: { id: true },
  });
  /*
    ONE writer for per-person permissions: the builder's (`setAssignmentPermissions`),
    so an invited grant becomes the same personal role — or the same shared role
    it exactly matches — as one saved on the member later. Only on a NEW
    assignment, like the role above: re-joining never overwrites a decision an
    admin has made since. No ceiling here: `invitationSpaceGrantNow` already
    narrowed the set to what the inviter still holds.
  */
  if (built && !existing) {
    const perms = await invitationSpaceGrantNow(tx, invitation);
    await setAssignmentPermissions(tx as any, {
      organizationId: invitation.organizationId,
      assignmentId: assignment.id,
      spaceId: invitation.spaceId,
      choice: { permissions: perms },
      ceiling: null,
    });
  }
}
