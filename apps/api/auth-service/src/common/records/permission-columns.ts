type PermissionKey = 'canCreateTasks' | 'taskCreationScope' | 'canViewAllTasks' | 'canAssignTasks' | 'canManageUsers';

/** The five legacy permission columns a new member is written with, from their role's defaults. */
export function permissionColumns<T extends Record<PermissionKey, unknown>>(defaults: T): Pick<T, PermissionKey> {
  return {
    canCreateTasks: defaults.canCreateTasks,
    taskCreationScope: defaults.taskCreationScope,
    canViewAllTasks: defaults.canViewAllTasks,
    canAssignTasks: defaults.canAssignTasks,
    canManageUsers: defaults.canManageUsers,
  };
}

/** What sign-up and creating an organization return about the user. */
export const NEW_ACCOUNT_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  organizationId: true,
  onboardingCompleted: true,
  canCreateTasks: true,
  taskCreationScope: true,
  canViewAllTasks: true,
  canAssignTasks: true,
  canManageUsers: true,
} as const;
