import { SetMetadata } from '@nestjs/common';

export const PLAN_FEATURE_KEY = 'requiredPlanFeature';

/**
 * Require a premium CAPABILITY (e.g. 'recurring', 'overtime', 'invoicing',
 * 'workflows', 'audit_log', 'multi_org') that is gated purely by subscription
 * tier — i.e. features that are NOT task-modules on Organization.enabledModules.
 *
 * Enforced by PlanGuard via `tierAllows(user.planTier, key)`. Task-modules that
 * live on enabledModules should use `@RequireModule` instead.
 */
export const RequirePlan = (feature: string) => SetMetadata(PLAN_FEATURE_KEY, feature);
