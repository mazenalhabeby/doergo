import { Injectable } from '@nestjs/common';
import {
  personName,
  peopleNames,
  requiredRoleIds,
  roleNames,
  PrismaService,
  type ApprovalStepView,
  type RuleKind,
} from '@hbcfield/shared';
import { joinRoleNames, parseStoredFacts, stepRules } from './approval-steps';

/**
 * The open steps for the inbox: who went first and which roles are still needed. What is needed is read the way
 * the gate reads it — the rules as they are NOW against the facts the item was last judged on — so the inbox
 * never says "waiting for Finance" when the gate would let anybody finish it. A step from before the facts were
 * stored reads the roles active rules still name.
 */
@Injectable()
export class ApprovalStepsReader {
  constructor(private readonly prisma: PrismaService) {}

  /** ONE query each for steps (by id, in chunks), rules, people and roles — however long the inbox. */
  async steps(organizationId: string, items: Array<{ kind: RuleKind; itemId: string }>): Promise<ApprovalStepView[]> {
    if (!items.length) return [];
    const wanted = new Set(items.map((i) => `${i.kind}:${i.itemId}`));
    const ids = [...new Set(items.map((i) => i.itemId))];
    const chunks = Array.from({ length: Math.ceil(ids.length / 1000) }, (_, n) => ids.slice(n * 1000, n * 1000 + 1000));
    const rows = (
      await Promise.all(
        chunks.map((chunk) =>
          this.prisma.approvalStep.findMany({
            where: { organizationId, consumedAt: null, itemId: { in: chunk } },
            select: { kind: true, itemId: true, firstById: true, requiredRoleIds: true, doneRoleIds: true, facts: true },
          }),
        ),
      )
    )
      .flat()
      .filter((r) => wanted.has(`${r.kind}:${r.itemId}`));
    if (!rows.length) return [];
    const rules = await stepRules(this.prisma, organizationId, [...new Set(rows.map((r) => r.kind as RuleKind))]);
    const left = (r: (typeof rows)[number]) => {
      const ofKind = rules.filter((x) => x.kind === r.kind);
      const facts = parseStoredFacts(r.facts);
      const needed = facts
        ? requiredRoleIds(ofKind, facts)
        : r.requiredRoleIds.filter((id) => ofKind.some((x) => x.secondRoleId === id));
      return needed.filter((x) => !r.doneRoleIds.includes(x));
    };
    const leftOf = new Map(rows.map((r) => [r, left(r)]));
    const [people, roles] = await Promise.all([
      peopleNames(this.prisma, [...new Set(rows.map((r) => r.firstById))]),
      roleNames(this.prisma, [...new Set([...leftOf.values()].flat())]),
    ]);
    const personById = new Map(people.map((p) => [p.id, personName(p)]));
    const roleById = new Map(roles.map((r) => [r.id, r.name]));
    return rows
      .filter((r) => leftOf.get(r)!.length)
      .map((r) => ({
        kind: r.kind as RuleKind,
        itemId: r.itemId,
        firstById: r.firstById,
        firstByName: personById.get(r.firstById) ?? '',
        roleName: joinRoleNames(leftOf.get(r)!, roleById),
      }));
  }
}
