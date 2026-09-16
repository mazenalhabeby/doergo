/**
 * "Is this module running in a workspace I can see?"
 *
 * The question a NAVIGATION gate must ask. Not "has the organization bought
 * it" — a module is purchased per space, so an org-wide list answers a
 * different question and gets it wrong in both directions: it hides an entry
 * from a member whose own depot runs the module, and it offers one to a member
 * who can see no workspace that does.
 *
 * `spaceModules` is the union across the workspaces the member can see, with a
 * never-configured workspace counted as inheriting the organization's list. It
 * is resolved server-side and rides on the session, so asking costs no request
 * — and, more importantly, the navigation and the pages behind it cannot answer
 * differently.
 *
 * ⚠️ ABSENT AND EMPTY ARE DIFFERENT ANSWERS, and this is the whole reason the
 * rule is worth extracting. `spaceModules` arrives with the session, so a
 * session that PREDATES the field — a deploy window, or a cached token response
 * — carries none at all. Reading that as "no workspace runs anything" takes the
 * entry away from people who had it a minute earlier, which is a worse failure
 * than the one the gate exists to prevent. Unknown falls back to the
 * organization's list; a real empty list means what it says.
 *
 * ⚠️ This is a GATE ON A WAY IN, never a boundary. The server refuses the route
 * regardless; this only stops offering a door that opens onto a 402.
 *
 * Lived in two places before this file — the web navbar and the phone's Manage
 * list — which is how a member comes to see Clients on the web and not on the
 * phone.
 */
export interface ModuleSubject {
  /** Union across visible workspaces. `undefined` = this session never carried it. */
  spaceModules?: string[] | null;
  /** The organization's own list, and the fallback for a session without the above. */
  orgModules?: string[] | null;
}

export function moduleAnywhere(subject: ModuleSubject | null | undefined, moduleKey: string): boolean {
  if (!subject) return false;
  const spaces = subject.spaceModules;
  // Deliberately `== null`: absent AND explicit null both mean "never told".
  if (spaces == null) return (subject.orgModules ?? []).includes(moduleKey);
  return spaces.includes(moduleKey);
}
