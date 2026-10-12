import { Prisma } from '@prisma/client';
import { EXTERNAL_DEFAULT_ROLE_SLUG, SHARED_ROLE_WHERE } from '@hbcfield/shared';

/**
 * Which role an accepting member gets in the space the invitation assigned.
 *
 * An external member's whole authority is their space role: the server refuses
 * an org-wide one for them, on purpose, because an org role reaches every
 * space. The invite form knew that and sent no role at all, so an external
 * invitation produced a member holding NOTHING — signed in, with every
 * supervisor surface correctly refusing them. Empty and correct is the hardest
 * empty to diagnose; the first one cost an afternoon.
 *
 * So an external member defaults to the role that exists for exactly this
 * person. It is a DEFAULT, not a rule:
 *
 *   • an explicitly chosen role always wins;
 *   • an assignment that already carries a role is never touched — the callers
 *     pass this only on CREATE, so re-accepting cannot overwrite a decision an
 *     admin has since made;
 *   • it grants nothing new. The role is a normal, editable, per-organization
 *     record — an admin can change what it means, or swap it afterwards.
 *
 * Returns null when the organization has no such role (it is seeded for every
 * org, but a seed can be deleted, and a missing default must leave the member
 * role-less rather than fail their onboarding).
 */
export async function defaultSpaceRoleId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  opts: { isExternal: boolean; chosenRoleId?: string | null },
): Promise<string | null> {
  /*
    A space assignment references a SPACE role, or none.

    `Invitation.memberRoleId` holds two different things: for an external
    member it is the SPACE role the invite named; for our own staff it is their
    ORG-wide role. Both accept paths passed it here unconditionally, so an
    internal member's org role was copied onto their space assignment as well —
    and when an admin later demoted them org-wide, the same permissions lived on
    in that space, where no screen about their org role would ever show them.

    So the chosen role is used only when it IS a space-scoped management role in
    this organization. Anything else (an org role, a trade, another org's id, a
    switched-off role) falls through to the default below — which is null for
    our own staff.
  */
  if (opts.chosenRoleId) {
    const chosen = await tx.accessRole.findFirst({
      where: {
        id: opts.chosenRoleId,
        organizationId,
        scope: 'SPACE',
        kind: { not: 'WORK' },
        isActive: true,
        // Never one person's personal role — an invitation names a role anybody may hold.
        ...SHARED_ROLE_WHERE,
      },
      select: { id: true },
    });
    if (chosen) return chosen.id;
  }
  if (!opts.isExternal) return null;

  const role = await tx.accessRole.findFirst({
    // By slug, never by name: the name is editable per organization, and
    // "External Supervisor" is translated in the seed for some locales.
    where: { organizationId, slug: EXTERNAL_DEFAULT_ROLE_SLUG, isActive: true, ...SHARED_ROLE_WHERE },
    select: { id: true },
  });
  return role?.id ?? null;
}
