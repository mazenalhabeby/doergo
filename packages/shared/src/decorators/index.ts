/**
 * Shared NestJS Decorators
 *
 * Reusable decorators for authentication, authorization, and parameter extraction.
 * These can be used across multiple services.
 */

import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../types/enums';

// =============================================================================
// METADATA KEYS
// =============================================================================

/**
 * Key for storing roles metadata
 */
export const ROLES_KEY = 'roles';

/**
 * Key for marking routes as public (no auth required)
 */
export const IS_PUBLIC_KEY = 'isPublic';

// =============================================================================
// DECORATORS
// =============================================================================

/**
 * Decorator to specify required roles for a route
 *
 * @example
 * @Roles(Role.ADMIN, Role.EMPLOYEE)
 * @Get('tasks')
 * getTasks() {}
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Decorator to mark a route as public (no authentication required)
 *
 * @example
 * @Public()
 * @Post('login')
 * login() {}
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// =============================================================================
// CUSTOMER PORTAL ALLOWLIST
// =============================================================================
/**
 * Marks a route (or controller) as reachable by external CUSTOMER users.
 * CustomerConfinementGuard is default-DENY for customers: a CUSTOMER token can
 * only reach @Public routes, @AllowCustomer routes, and its own portal. Staff
 * are unaffected. This makes the portal an allowlist, not a blocklist.
 */
export const IS_CUSTOMER_ALLOWED_KEY = 'isCustomerAllowed';
export const AllowCustomer = () => SetMetadata(IS_CUSTOMER_ALLOWED_KEY, true);

// =============================================================================
// CURRENT USER
// =============================================================================

/**
 * User data attached to request by JWT auth guard
 */
export interface CurrentUserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role | string;
  organizationId: string | null;
  onboardingCompleted: boolean;
  avatarUrl?: string | null;
  // Permission fields
  canCreateTasks: boolean;
  taskCreationScope?: string;
  canViewAllTasks: boolean;
  canAssignTasks: boolean;
  canManageUsers: boolean;
  // Worker configuration
  position?: string | null;
  scheduleType?: string | null;
  // Custom role
  orgRoleId?: string | null;
  orgRole?: { id: string; name: string; slug: string; color?: string | null } | null;
  rolePermissions?: Record<string, boolean>;
  // Access Profile (mobile tabs / web screens) — legacy string[] or object form.
  enabledModules?: unknown;
  // Org FEATURE modules (sprints, checklists, tracking…) — drives hasFeature().
  orgModules?: string[];
  // Billing (lowercase) — carried on the token for the SubscriptionGuard.
  subStatus?: string; // 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  planTier?: string | null; // 'starter' | 'professional' | 'business' | 'enterprise'
  // Technician-specific fields
  // Profile badge visibility (resolved: user override > org default > system default)
  profileBadges?: {
    showRole: boolean;
    showType: boolean;
    showSpecialty: boolean;
  };
  // Per-user clock display preference ("12h" | "24h"); display-only.
  timeFormat?: string;
  // Customer portal: for role=CUSTOMER, the Customer they act as + default unit.
  // Null for staff. Portal endpoints scope every query to this customerId.
  customerId?: string | null;
  unitId?: string | null;
  customerPortalEnabled?: boolean; // org-level opt-in
}

/**
 * Parameter decorator to extract current user from request
 *
 * @example
 * // Get full user object
 * @Get('profile')
 * getProfile(@CurrentUser() user: CurrentUserData) {}
 *
 * @example
 * // Get specific property
 * @Get('my-tasks')
 * getMyTasks(@CurrentUser('id') userId: string) {}
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext): CurrentUserData | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);

// =============================================================================
// PERMISSIONS
// =============================================================================

/**
 * Key for storing required permissions metadata
 */
export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Permission fields available on the user object
 */
export type PermissionField = 'canCreateTasks' | 'canViewAllTasks' | 'canAssignTasks' | 'canManageUsers';

/**
 * Decorator to specify required permissions for a route.
 * The user must have ALL listed permissions set to true.
 * ADMIN role always passes (has all permissions by default).
 *
 * @example
 * @RequirePermission('canCreateTasks')
 * @Post('tasks')
 * createTask() {}
 *
 * @example
 * @RequirePermission('canViewAllTasks', 'canAssignTasks')
 * @Patch('tasks/:id/assign')
 * assignTask() {}
 */
export const RequirePermission = (...permissions: PermissionField[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// =============================================================================
// SKIP ONBOARDING CHECK
// =============================================================================

export { SkipOnboardingCheck, IS_SKIP_ONBOARDING_KEY } from './skip-onboarding.decorator';
