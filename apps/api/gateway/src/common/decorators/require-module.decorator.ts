import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'requiredFeatureModule';

/**
 * Require a FEATURE module (e.g. 'sprints', 'epics', 'phases') to be enabled for
 * the user's organization. Enforced by ModuleGuard. Defense-in-depth on top of
 * the UI gating — the API rejects creating data for a disabled module.
 */
export const RequireModule = (module: string) => SetMetadata(MODULE_KEY, module);
