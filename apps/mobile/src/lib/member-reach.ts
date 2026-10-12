import { crmCapsAnywhere, crmReachOf, hasAccessModule, moduleAnywhere, NO_CRM_CAPS, type CrmCaps } from '@hbcfield/shared/client';

/**
 * ⭐ TWO QUESTIONS ABOUT A MEMBER THAT THE HOME AND ITS SHORTCUTS BOTH ASK.
 *
 * One file so the widget and the tile that lead to the same place cannot
 * answer differently — the route widget and the Plan route tile disagreeing
 * about the same member is exactly the drift `availableWidgets` exists to
 * prevent. Both are read off the session: no request.
 *
 * ⚠️ A GATE ON A WAY IN, never a boundary. The server refuses on its own
 * (`@DenyExternal`, the CRM reach, the module check on `/routes/optimize`).
 */
type Subject = Parameters<typeof moduleAnywhere>[0] & {
  isExternal?: boolean | null;
  role?: string | null;
  enabledModules?: unknown;
  access?: { org?: Record<string, boolean>; perSpace?: Record<string, Record<string, boolean>> } | null;
};

/**
 * Works for a client or partner, not for this organization.
 *
 * ⚠️ `=== true`: a session from a server that predates the field carries
 * nothing, and reading that as external would take the client book and the
 * equipment away from every member for the length of a deploy.
 */
export function isExternalMember(user: Subject | null | undefined): boolean {
  return user?.isExternal === true;
}

/**
 * Does this member drive a route — the Today's route widget and the Plan
 * route tile?
 *
 *   • `tracking` runs in a workspace they are ASSIGNED to (`spaceModules` is
 *     resolved from their assignments; an admin's from every workspace);
 *   • they carry jobs — the `tasks` module in their Access Profile. Somebody
 *     who works on site, clocks in and never gets a job has no stops;
 *   • they work for the organization — an external member drives for nobody.
 *
 * ⚠️ There is no "on site only" field to ask: `workMode` was removed and the
 * Access Profile replaced it. Taking `tasks` off a member, or leaving tracking
 * off their workspace, is how an office decides who drives.
 */
export function drivesRoutes(user: Subject | null | undefined): boolean {
  if (!user || isExternalMember(user)) return false;
  return moduleAnywhere(user, 'tracking') && hasAccessModule(user as never, 'tasks');
}

/**
 * This member's CRM abilities, the widest held ANYWHERE — the same reach the
 * server builds (`crmReachOfRow` → `crmReachOf` in shared).
 *
 *   • org-wide: the session's `access.org`, which is what THE access resolver
 *     (`memberAccessOf`) produced at sign-in — an inactive role grants
 *     nothing, a legacy column only while the server still honours it. The
 *     flat `can*` columns on the user are NOT read: they are not the resolver.
 *   • per workspace: the crm* keys of each space role in `access.perSpace`,
 *     with no legacy bridge, and only where the `crm` module runs. An external
 *     member's whole authority is one such role, so a client's supervisor given
 *     "view clients" in their workspace is offered the client book here, while
 *     their org-wide caps stay none.
 *
 * ⚠️ `crmSpaces` is "does crm run in a workspace I can see" (`spaceModules` is
 * resolved from the member's own assignments). The session carries no per-space
 * module map, so this cannot narrow to the exact workspace; the server does,
 * and lists only the clients of the workspaces that qualify.
 *
 * One helper, read by the home widget AND the shortcut tiles AND Manage.
 * A gate on a way in — the server narrows every read and write by itself.
 */
export function crmCapsOf(user: Subject | null | undefined): CrmCaps {
  if (!user) return NO_CRM_CAPS;
  const reach = crmReachOf(user.role ?? null, (user.access ?? null) as never, {
    crmSpaces: () => moduleAnywhere(user, 'crm'),
    isExternal: isExternalMember(user),
  });
  return crmCapsAnywhere(reach);
}
