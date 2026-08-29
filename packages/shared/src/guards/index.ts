/**
 * Shared Guard Utilities
 *
 * Helper functions for role-based and permission-based authorization.
 * Note: RolesGuard and OnboardingCompleteGuard classes must be defined in each app
 * due to NestJS DI requirements. The shared package provides the implementation.
 */

export { OnboardingCompleteGuard } from './onboarding.guard';
export { PermissionsGuard } from './permissions.guard';
export { CustomerScopeGuard } from './customer-scope.guard';
export { CustomerConfinementGuard } from './customer-confinement.guard';


// Pure role/permission helpers. Defined in their own module so the browser
// can import them without pulling NestJS; re-exported here so every existing
// `from '@hbcfield/shared'` import is unchanged.
export * from './role-helpers';
