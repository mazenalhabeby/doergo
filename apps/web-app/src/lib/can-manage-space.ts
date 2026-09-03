import { accessAllows } from "@hbcfield/shared/client"

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
 * A different permission from configuring the space, and kept a separate
 * function so the two cannot be conflated again: the dashboard offered both
 * buttons on a "can view all tasks" check, which is neither of them.
 */
export function canManageMembersInSpace(
  user: { canManageUsers?: boolean; access?: unknown } | null | undefined,
  spaceId?: string,
): boolean {
  if (!user) return false
  if (user.canManageUsers === true) return true
  return accessAllows(user.access as Parameters<typeof accessAllows>[0], "canManageUsers", spaceId)
}
