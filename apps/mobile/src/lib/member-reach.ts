import { hasAccessModule, moduleAnywhere } from '@hbcfield/shared/client';

/**
 * ⭐ TWO QUESTIONS ABOUT A MEMBER THAT THE HOME AND ITS SHORTCUTS BOTH ASK.
 *
 * One file so the widget and the tile that lead to the same place cannot
 * answer differently — the route widget and the Plan route tile disagreeing
 * about the same member is exactly the drift `availableWidgets` exists to
 * prevent. Both are read off the session: no request.
 *
 * ⚠️ A GATE ON A WAY IN, never a boundary. The server refuses on its own
 * (`@DenyExternal`, the module check on `/routes/optimize`).
 */
type Subject = Parameters<typeof moduleAnywhere>[0] & {
  isExternal?: boolean | null;
  role?: string | null;
  enabledModules?: unknown;
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
