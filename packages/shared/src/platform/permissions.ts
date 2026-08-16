/**
 * Platform-staff RBAC — the SINGLE SOURCE OF TRUTH for what each platform role can
 * do. Shared by auth-service (enforcement) and the gateway (route guard) so they
 * can never drift. The admin app never imports this — it receives the caller's
 * resolved capabilities from `/platform/auth/me` (server is authoritative).
 */
export type PlatformRole = 'OWNER' | 'CONTROLLER' | 'SUPPORT' | 'BILLING';

export type PlatformCapability =
  | 'view' // overview / orgs / metrics
  | 'extendTrial'
  | 'manageOrgs' // set tier / suspend / reactivate
  | 'editPricing' // C2/C3 pricing
  | 'billingOps' // refunds / credits / coupons
  | 'manageSupport' // tickets / live chat
  | 'managePlatformUsers'; // add/remove staff, set roles

export const PLATFORM_ROLES: PlatformRole[] = ['OWNER', 'CONTROLLER', 'SUPPORT', 'BILLING'];

const ALL: PlatformCapability[] = [
  'view', 'extendTrial', 'manageOrgs', 'editPricing', 'billingOps', 'manageSupport', 'managePlatformUsers',
];

export const PLATFORM_PERMISSIONS: Record<PlatformRole, PlatformCapability[]> = {
  OWNER: ALL,
  CONTROLLER: ['view', 'extendTrial', 'manageOrgs', 'manageSupport'],
  SUPPORT: ['view', 'extendTrial', 'manageSupport'],
  BILLING: ['view', 'extendTrial', 'manageOrgs', 'editPricing', 'billingOps'],
};

/** Does this platform role grant the capability? Unknown roles → deny (fail closed). */
export function platformCan(role: string | null | undefined, cap: PlatformCapability): boolean {
  const perms = PLATFORM_PERMISSIONS[(role ?? '') as PlatformRole];
  return !!perms && perms.includes(cap);
}

/** Resolve the full capability list for a role (for the client to hide/show UI). */
export function platformCapsFor(role: string | null | undefined): PlatformCapability[] {
  return PLATFORM_PERMISSIONS[(role ?? '') as PlatformRole] ?? [];
}
