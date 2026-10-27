import type { PrismaService, RuleFacts, RuleKind } from '@hbcfield/shared';

/**
 * The open approval step of one item, closing steps, and the rules that gate. One OPEN step per item is a partial
 * unique index (see approval-rules.service.ts).
 */
export function openStep(
  prisma: PrismaService,
  organizationId: string,
  kind: RuleKind,
  itemId: string,
  aliases: string[] = [],
) {
  return prisma.approvalStep.findMany({
    where: { organizationId, kind, itemId: { in: [itemId, ...aliases] }, consumedAt: null },
    orderBy: { firstAt: 'desc' },
  });
}

/** Mark one step used — only if nobody else did first. */
export async function consumeStep(prisma: PrismaService, id: string) {
  await prisma.approvalStep.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
}

/**
 * The active rules with a SECOND STEP for these kinds, oldest first, read as the shared rule helpers take them.
 * (Reminder-only rules are the sweep's; they never gate a decision.)
 */
export async function stepRules(prisma: PrismaService, organizationId: string, kinds: RuleKind[]) {
  const rows = await prisma.approvalRule.findMany({
    where: { organizationId, kind: { in: kinds }, isActive: true, secondRoleId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  // Prisma reads `kind` as a string; only RULE_KINDS are ever written (saveRule refuses the rest).
  return rows.map((r) => ({ ...r, kind: r.kind as RuleKind }));
}

/** What a step stores of the facts it was judged on (the inbox reads the rules against them). */
export function storedFacts(facts: RuleFacts) {
  return JSON.parse(JSON.stringify(facts)) as object;
}

/** The facts a step stored, read back — null for a step from before they were stored, or anything unreadable. */
export function parseStoredFacts(value: unknown): RuleFacts | null {
  if (!value || typeof value !== 'object') return null;
  const spaceIds = (value as { spaceIds?: unknown }).spaceIds;
  if (!Array.isArray(spaceIds) || !spaceIds.every((s) => typeof s === 'string')) return null;
  return value as RuleFacts;
}

/**
 * The roles still needed, in words ("HR + Finance"). A role deleted since cannot be named, and nobody holds it:
 * only an administrator can finish such an item, so that is what it says — never "waiting for ".
 */
export function joinRoleNames(roleIds: string[], names: ReadonlyMap<string, string>): string {
  return (
    roleIds
      .map((id) => names.get(id) ?? '')
      .filter(Boolean)
      .join(' + ') || 'an administrator'
  );
}
