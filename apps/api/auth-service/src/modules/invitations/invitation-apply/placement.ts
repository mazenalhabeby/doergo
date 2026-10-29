/** Where an accepted invitation places the member: the workspace and the role it grants now. */
import { Prisma, Role as PrismaRole } from '@prisma/client';
import {
  PERMISSION_KEYS,
  externalForbiddenIn,
  loadSpacePermissionCeiling,
  setAssignmentPermissions,
  type PermissionSet,
  whitelistPermissions,
  memberEverIn,
  workspaceInOrg,
} from '@hbcfield/shared';
import { defaultSpaceRoleId } from '../invitation-space-role';

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
    const ceiling = await loadSpacePermissionCeiling(
      tx,
      invitation.createdById,
      invitation.organizationId,
      invitation.spaceId,
    );
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
    // The JSON column as the invite form wrote it; rows that are not a day + two times are skipped.
    type ScheduleRow = { dayOfWeek: number; startTime: string; endTime: string; isActive?: boolean };
    const rows = (invitation.schedule as Partial<ScheduleRow>[]).filter(
      (r): r is ScheduleRow => !!r && typeof r.dayOfWeek === 'number' && !!r.startTime && !!r.endTime,
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
  // Never the Remote bucket (`assignable`): it reads as absent, like an archived space.
  const space = await workspaceInOrg(tx, invitation.spaceId, invitation.organizationId, {
    activeOnly: true,
    assignable: true,
  });
  if (!space) return;
  // Permissions built for this person (external only): granted below through the builder's own writer.
  const built = invitation.isExternal && invitation.spacePermissions != null;
  const existing = built ? await memberEverIn(tx, userId, invitation.spaceId) : null;
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
    await setAssignmentPermissions(tx, {
      organizationId: invitation.organizationId,
      assignmentId: assignment.id,
      spaceId: invitation.spaceId,
      choice: { permissions: perms },
      ceiling: null,
    });
  }
}
