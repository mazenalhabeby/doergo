/**
 * May this member manage THIS space, and its people?
 *
 * Shared because both clients ask it: the rule lived in the web app, and the
 * mobile dashboard — which grew the same Assign button — had no way to ask it
 * without a second copy that would drift.
 */
import { accessAllows } from '../types/permissions';

/**
 * May this member configure THIS space?
 *
 * One rule, two callers. The settings page computed it inline and the space
 * card offered "Configure" to everybody — so the button was shown to people it
 * then refused, and the only feedback was a permission wall after a page load.
 * A control that leads nowhere is worse than an absent one: it reads as a
 * broken screen rather than a permission.
 *
 * Space-aware on purpose: a Space Manager holds `canManageWorkspaces` inside
 * their own space and nowhere else, so the org-wide flag alone would hide the
 * button from exactly the person it belongs to.
 *
 * `canManageUsers` is honoured because it used to grant this and every existing
 * manager still holds it — see the split noted on the permission catalogue.
 *
 * This decides what to RENDER. The endpoints refuse independently
 * (`@RequirePermission('canManageWorkspaces')` on create/update/delete), so
 * this can never widen anything; getting it wrong only shows or hides a button.
 */
export function canManageSpace(
  user: { canManageWorkspaces?: boolean; canManageUsers?: boolean; access?: unknown } | null | undefined,
  spaceId?: string,
): boolean {
  if (!user) return false
  if (user.canManageWorkspaces === true || user.canManageUsers === true) return true
  const access = user.access as Parameters<typeof accessAllows>[0]
  return (
    accessAllows(access, "canManageWorkspaces", spaceId) ||
    accessAllows(access, "canManageUsers", spaceId)
  )
}

/**
 * May this member add or remove people in THIS space?
 *
 * A different question from configuring the space, and kept a separate function
 * so the two cannot be conflated again: the dashboard offered both buttons on a
 * "can view all tasks" check, which is neither of them.
 *
 * It asks for the permission the endpoint actually enforces —
 * `POST /locations/:id/members` is `@RequirePermissionInSpace
 * ('canManageWorkspaces')`, and holding `canManageUsers` does not satisfy that
 * guard. Asking for the wrong one showed the Assign button to a member the
 * server then refused, which reads as a broken screen rather than a permission.
 * Every admin holds both, so nobody who could use the button loses it.
 */
export function canManageMembersInSpace(
  user: { canManageWorkspaces?: boolean; access?: unknown } | null | undefined,
  spaceId?: string,
): boolean {
  if (!user) return false
  if (user.canManageWorkspaces === true) return true
  return accessAllows(user.access as Parameters<typeof accessAllows>[0], "canManageWorkspaces", spaceId)
}
