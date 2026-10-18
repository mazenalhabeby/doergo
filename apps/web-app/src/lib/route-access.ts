/**
 * Who may open which page — ONE table, read by every way in.
 *
 * The dashboard layout used to ask three things of a signed-in member (signed
 * in, onboarded, not mobile-only) and then render ANY page they typed. Some
 * twenty pages drew their full shell around queries the gateway refused with a
 * 403, and the navbar, the settings list, the Manage hub and each page decided
 * "may this person be here?" with their own copy of the answer — which is how
 * the Team menu was offered to dispatchers whose every Team page 403s, and the
 * settings tab bar offered admin-only sections to everybody.
 *
 * Each entry mirrors the GATEWAY: the guard on the endpoints the page cannot
 * work without. The server stays the authority; this decides what is worth
 * rendering, and it must never be NARROWER than the server (a granted
 * permission that no surface offers is decorative) nor WIDER (a page that only
 * shows refusals reads as broken software).
 *
 * The four ways a grant is asked, matching the guards:
 *
 *   • `org:X`  — `@RequirePermission('X')`: PermissionsGuard reads the flat flag
 *                or the ORG-wide resolved access. An admin passes.
 *   • `any:X`  — `@RequirePermissionInSpace('X')`: held org-wide OR in any
 *                workspace (the service narrows to those workspaces).
 *   • `admin`  — `@Roles(Role.ADMIN)`.
 *   • an array — any one of the grants in it (an OR the page itself makes, e.g.
 *                "the directory, or your workspace's roster").
 *
 * Options (add-ons) are asked through `hasOption` — `hasPlanFeature` in the
 * app, which fails closed on anything that is not an add-on — and NEVER with a
 * module key. Modules are asked with `moduleAnywhere` (running in a workspace
 * this member can see).
 */
export {
  type AccessUser,
  type AccessContext,
  type Grant,
  type AccessRule,
  type DenyReason,
  type AccessVerdict,
  holdsGrant,
  evaluateRule
} from './route-access/rules';
export { ROUTE_RULES } from './route-access/table';
export {
  SETTINGS_SECTION_RULES,
  settingsSectionsFor,
  defaultSettingsSection,
  resolveSettingsSection,
  routeRuleFor,
  checkRoute,
  mayOpen,
  navOffers,
  type NavModel,
  navModelFor,
} from './route-access/nav';
