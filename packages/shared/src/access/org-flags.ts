import {
  PERMISSION_KEYS,
  accessAllows,
  resolveCrmCaps,
  type AccessPermissionKey,
  type ResolvedAccess,
} from '../types/permissions';

/**
 * The flat, org-wide permission fields on the request user — `req.user.canX`,
 * read by `@RequirePermission` and the org half of `@RequirePermissionInSpace`.
 *
 * ⚠️ This was a hand-written list of twenty-odd fields in auth-common, and a
 * key missing from the list was REFUSED EVERYWHERE without anything looking
 * wrong: the six CRM keys were never in it, so `@RequirePermission('crmEditInfo')`
 * turned down every non-admin's address edit and client invitation, including
 * the people whose role grants exactly that. Every key now gets a field.
 *
 * BRIDGES keep a grant that was split out of a broader one: whoever held the
 * broad key before the split still holds the precise one. A bridge only ever
 * applies org-wide — a space grant is read by the key itself — and documents
 * have none on purpose (a bridge there would GRANT payslip access, not keep it).
 */
export const ORG_FLAG_BRIDGES: Partial<Record<AccessPermissionKey, readonly AccessPermissionKey[]>> = {
  canManageInvoices: ['canViewAllTasks'],
  canViewLabourCost: ['canManageUsers'],
  canManageAssets: ['canManageUsers'],
  canViewAssets: ['canViewAllTasks', 'canManageAssets', 'canManageUsers'],
  canLogAssets: ['canManageAssets', 'canManageUsers'],
  canManageWorkspaces: ['canManageUsers'],
  canManageRota: ['canManageUsers'],
  canManagePortals: ['canManageUsers'],
  canAnswerPortal: ['canManagePortals', 'canManageUsers'],
  canViewPortal: ['canAnswerPortal', 'canManagePortals', 'canManageUsers'],
  canManageTaskTypes: ['canManageUsers'],
  canReconcileAttendance: ['canManageUsers'],
  canApproveAttendance: ['canReconcileAttendance', 'canManageUsers'],
  canDeleteAttendance: ['canReconcileAttendance', 'canManageUsers'],
  canViewSpaceAttendance: ['canViewAllTasks'],
  canApproveOvertime: ['canManageUsers', 'canViewAllTasks'],
  canViewTracking: ['canViewAllTasks'],
  canAddSpaceMembers: ['canManageUsers'],
  canGrantSpaceRoles: ['canManageUsers'],
  canManageApprovalRules: ['canManageUsers'],
};

const CRM_KEYS = new Set<AccessPermissionKey>([
  'crmViewOwn',
  'crmViewAll',
  'crmWork',
  'crmEditInfo',
  'crmCreateClients',
  'crmManageClients',
]);

/** Every permission key as an org-wide boolean, bridges applied. */
export function orgFlagFields(access: ResolvedAccess): Record<AccessPermissionKey, boolean> {
  // CRM keys answer exactly what the customers service enforces (its own legacy bridge included).
  const crm = resolveCrmCaps(null, access.org);
  const out = {} as Record<AccessPermissionKey, boolean>;
  for (const key of PERMISSION_KEYS) {
    if (CRM_KEYS.has(key)) continue;
    out[key] = accessAllows(access, key) || (ORG_FLAG_BRIDGES[key] ?? []).some((b) => accessAllows(access, b));
  }
  out.crmViewAll = crm.view === 'all';
  out.crmViewOwn = crm.view !== 'none';
  out.crmWork = crm.work;
  out.crmEditInfo = crm.editInfo;
  out.crmCreateClients = crm.create;
  out.crmManageClients = crm.manage;
  return out;
}
