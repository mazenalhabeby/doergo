import {
  memberAccessOf,
  roleHoldersWithAccess,
  mayDecideRuleKind,
  ruleKindsDecidedBy,
  type PrismaService,
  type RuleKind,
} from '@hbcfield/shared';

/**
 * Can anybody holding this role give an approval of this kind (in the rule's workspace, or anywhere for a rule that
 * covers all)? A rule naming a role whose holders all lack the kind's permission would leave its items waiting for
 * an approval nobody can give — the kind's own route refuses them before the rule is ever asked.
 */
export async function roleCanDecide(
  prisma: PrismaService,
  organizationId: string,
  roleId: string,
  kind: RuleKind,
  spaceId: string | null,
): Promise<boolean> {
  const people = await roleHoldersWithAccess(prisma, organizationId, [roleId], new Date());
  return people.some((p) => mayDecideRuleKind(memberAccessOf(p), kind, spaceId));
}

/** For each role: the rule kinds at least one of its holders could approve — the rules page marks the rest. */
export async function ruleKindsByRole(
  prisma: PrismaService,
  organizationId: string,
  roleIds: string[],
): Promise<Record<string, RuleKind[]>> {
  if (!roleIds.length) return {};
  const people = await roleHoldersWithAccess(prisma, organizationId, roleIds, new Date());
  const out: Record<string, Set<RuleKind>> = {};
  for (const p of people) {
    const kinds = ruleKindsDecidedBy(memberAccessOf(p));
    const held = new Set([p.memberRoleId, ...p.spaceAssignments.map((a) => a.roleId)]);
    for (const r of roleIds) if (held.has(r)) for (const k of kinds) (out[r] ??= new Set()).add(k);
  }
  return Object.fromEntries(roleIds.map((r) => [r, [...(out[r] ?? [])]]));
}
