/**
 * Authorization helpers shared by every app.
 *
 * ⚠️ The guard CLASSES live in the gateway (`apps/api/gateway/src/common/guards`)
 * and nowhere else: Nest injects `Reflector` by class identity, so a guard must be
 * compiled in the app that registers it. Copies of four of them used to sit here
 * too, exported and imported by nothing — and one (PermissionsGuard) had already
 * drifted: no space-scoped check, no admin rule. Two copies of an access check
 * are how a fix lands in the one that never runs. Only pure helpers belong here.
 */

// Pure role/permission helpers. Defined in their own module so the browser
// can import them without pulling NestJS; re-exported here so every existing
// `from '@hbcfield/shared'` import is unchanged.
export * from './role-helpers';
