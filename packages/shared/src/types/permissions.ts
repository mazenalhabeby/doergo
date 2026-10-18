/** Permissions — keys, roles, sets and resolved access. The parts live in ./permissions/; this file is the entry. */

export {
  PERMISSION_KEYS,
  type AccessPermissionKey,
  type PermissionSet,
  type PermissionGrantScope,
  type PermissionDomain,
  ACCESS_PERMISSION_SCHEMA,
} from './permissions/keys';
export { type CrmViewScope, type CrmCaps, resolveCrmCaps, ownsClient } from './permissions/crm-caps';
export {
  type RoleScope,
  type RolePreset,
  EXTERNAL_DEFAULT_ROLE_SLUG,
  BUILTIN_ROLES,
} from './permissions/builtin-roles';
export {
  permissionsFromUserFlags,
  permissionsFromOrgRole,
  mergePermissions,
  permissionsExceed,
} from './permissions/permission-sets';
export {
  EXTERNAL_ALLOWED_PERMISSIONS,
  permissionLabel,
  externalMayHold,
  externalForbiddenIn,
  SPACE_LEADER_PERMISSION,
  isSpaceLeaderPermissions,
} from './permissions/external';
export { type SpaceShareLevel, spaceShareLevelToPermissions, type SharedSpaceGrant } from './permissions/space-share';
export {
  type ResolvedAccess,
  IMPLIED_PERMISSIONS,
  withImpliedPermissions,
  buildResolvedAccess,
  accessAllows,
  spacesGranting,
  resolveTaskCreationScope,
  accessAllowsInSpace,
  accessAllowsAnywhere,
} from './permissions/resolved-access';
export { jobTitleOf } from './permissions/job-title';
