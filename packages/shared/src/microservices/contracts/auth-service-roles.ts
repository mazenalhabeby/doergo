/**
 * Workspace (SPACE-scope) roles written by auth-service on task-service's behalf — auth owns AccessRole
 * (docs/data-ownership.md, group D). task-service keeps the rules (name free, ceiling, work-role kinds)
 * and sends the row it decided on; merge and delete stay in task-service (one transaction with the
 * assignments — the agreed exception).
 */
import { rpc } from '../contract';

/** The columns task-service decides for a workspace role. `permissions` is a permission set. */
export interface SpaceRoleWrite {
  name?: string;
  slug?: string;
  description?: string | null;
  color?: string;
  scope?: 'SPACE' | 'BOTH';
  isSystem?: boolean;
  isActive?: boolean;
  isCustomized?: boolean;
  kind?: 'WORK' | 'MANAGEMENT';
  permissions?: Record<string, boolean>;
  position?: number;
}

/** Seed missing built-ins and bring un-customized ones up to their definition (shared builtin-role-sync). */
export const accessRolesEnsureBuiltIns = rpc<{ organizationId: string }, { success: boolean }>(
  'access_roles_ensure_builtins',
);
/** Create one workspace role with exactly these columns. */
export const spaceRoleCreate = rpc<
  { organizationId: string; role: SpaceRoleWrite & { name: string; slug: string } },
  { success: boolean; data?: Record<string, unknown> & { id: string }; message?: string }
>('space_role_create');
/** Change a workspace role of this organization. */
export const spaceRoleUpdate = rpc<
  { organizationId: string; roleId: string; patch: SpaceRoleWrite },
  { success: boolean; data?: Record<string, unknown> & { id: string }; message?: string }
>('space_role_update');
