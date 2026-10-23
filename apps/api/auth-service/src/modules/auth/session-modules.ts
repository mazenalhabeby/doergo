import { memberWorkspaceModules, type PrismaService } from '@hbcfield/shared';

/**
 * Every feature module switched on in a workspace this member can see.
 *
 * Modules are bought and enabled PER WORKSPACE, so the organization's own list
 * is not the answer: a company that runs Assets on one site has it on that
 * site's row and nowhere else. The navigation needs "is this worth offering at
 * all", and asking it per page would mean loading the workspace list on every
 * screen for every member.
 *
 * So it is answered once, with the session. One bounded query — module names
 * only, from the spaces this member is on (all of them for an admin, whose
 * reach is the organization). The union is a handful of short strings.
 */
export async function visibleSpaceModules(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
  isAdminUser: boolean,
  /*
    What a workspace runs when it has never been configured.

    A space's own list overrides the organization's; an ABSENT list inherits
    it — the same precedence the module gates apply. Without the fallback a
    brand-new workspace looks like it runs nothing, and the navigation hides
    features the organization is paying for.
  */
  orgFallback: string[] = [],
): Promise<string[]> {
  try {
    const spaces = await memberWorkspaceModules(prisma, organizationId, userId, isAdminUser);
    const out = new Set<string>();
    for (const s of spaces) {
      const own = s.enabledModules as string[] | null;
      for (const m of own?.length ? own : orgFallback) out.add(m);
    }
    return [...out];
  } catch {
    // Never fail a login over navigation garnish: an empty list simply means
    // the nav falls back to the organization's own modules.
    return [];
  }
}
