import { requiredRoleIds, type PrismaService, type RuleFacts, type RuleKind } from '@hbcfield/shared';

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
 * The active rules that ask more people to approve these kinds, oldest first, read as the shared rule helpers take them.
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

/** A new step: the first approval given, the roles every rule that applies still needs, and the facts judged on. */
export function stepCreateData(
  input: { organizationId: string; kind: RuleKind; deciderId: string },
  item: { itemId: string; facts: RuleFacts; ruleId: string; required: string[]; minutes?: number | null },
) {
  return {
    organizationId: input.organizationId,
    kind: input.kind,
    itemId: item.itemId,
    ruleId: item.ruleId,
    firstById: input.deciderId,
    approverIds: [input.deciderId],
    requiredRoleIds: item.required,
    minutes: item.minutes ?? item.facts.minutes ?? null,
    facts: storedFacts(item.facts),
  };
}

/**
 * Which roles an open step still waits for, read against the rules as they are NOW (the gate's own reading):
 * from the facts it was judged on, else — a step from before they were stored — the roles active rules still name.
 * ONE answer for the inbox, the reminders and anybody else asking.
 */
export function rolesStillNeeded(
  step: { requiredRoleIds: string[]; doneRoleIds: string[]; facts?: unknown },
  rules: Array<Parameters<typeof requiredRoleIds>[0][number]>,
): string[] {
  const facts = parseStoredFacts(step.facts);
  const needed = facts
    ? requiredRoleIds(rules, facts)
    : step.requiredRoleIds.filter((id) => rules.some((r) => r.secondRoleId === id));
  return needed.filter((r) => !step.doneRoleIds.includes(r));
}
