import { Role as PrismaRole } from '@prisma/client';
import {
  DEFAULT_PERMISSIONS,
  Role,
  getDefaultModules,
  externalMayHold,
  type AccessPersisted,
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
export interface InvitationFieldsSource {
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
