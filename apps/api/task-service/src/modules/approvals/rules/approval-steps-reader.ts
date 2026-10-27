import { Injectable } from '@nestjs/common';
import {
  memberRolesNow,
  personName,
  peopleNames,
  roleNames,
  PrismaService,
  type ApprovalStepView,
  type RuleKind,
} from '@hbcfield/shared';
import { joinRoleNames, parseStoredFacts, rolesStillNeeded, stepRules } from './approval-steps';

/**
 * The open steps for the inbox: who went first and which roles are still needed. What is needed is read the way
 * the gate reads it — the rules as they are NOW against the facts the item was last judged on — so the inbox
 * never says "waiting for Finance" when the gate would let anybody finish it. A step from before the facts were
 * stored reads the roles active rules still name.
 */
@Injectable()
export class ApprovalStepsReader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ONE query each for steps (by id, in chunks), rules, people, roles and — when a caller is named — the caller's
   * own roles, however long the inbox. For the caller: does it wait for THEM, and does their approval finish it.
   */
  async steps(
    organizationId: string,
    items: Array<{ kind: RuleKind; itemId: string }>,
    callerId?: string,
  ): Promise<ApprovalStepView[]> {
    if (!items.length) return [];
    const wanted = new Set(items.map((i) => `${i.kind}:${i.itemId}`));
    const ids = [...new Set(items.map((i) => i.itemId))];
    const chunks = Array.from({ length: Math.ceil(ids.length / 1000) }, (_, n) => ids.slice(n * 1000, n * 1000 + 1000));
    const rows = (
      await Promise.all(
        chunks.map((chunk) =>
          this.prisma.approvalStep.findMany({
            where: { organizationId, consumedAt: null, itemId: { in: chunk } },
            select: {
              kind: true,
              itemId: true,
              firstById: true,
              requiredRoleIds: true,
              doneRoleIds: true,
              approverIds: true,
              minutes: true,
              facts: true,
            },
          }),
        ),
      )
    )
      .flat()
      .filter((r) => wanted.has(`${r.kind}:${r.itemId}`));
    if (!rows.length) return [];
    const rules = await stepRules(this.prisma, organizationId, [...new Set(rows.map((r) => r.kind as RuleKind))]);
    const left = (r: (typeof rows)[number]) =>
      rolesStillNeeded(
        r,
        rules.filter((x) => x.kind === r.kind),
      );
    const leftOf = new Map(rows.map((r) => [r, left(r)]));
    const [people, roles, caller] = await Promise.all([
      peopleNames(this.prisma, [...new Set(rows.map((r) => r.firstById))]),
      roleNames(this.prisma, [...new Set([...leftOf.values()].flat())]),
      callerId ? memberRolesNow(this.prisma, organizationId, callerId, new Date()) : null,
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
        agreedMinutes: r.minutes ?? null,
        ...(caller ? forCaller(caller, r, leftOf.get(r)!) : {}),
      }));
  }
}

type CallerRoles = NonNullable<Awaited<ReturnType<typeof memberRolesNow>>>;

/**
 * The gate's own reading, for one caller: an active administrator finishes anything; otherwise it waits for them
 * when they hold a role still needed (org-wide, or in one of the item's workspaces) and have not approved it yet,
 * and they finish it when they hold EVERY role still needed. Never a second approval by the same person.
 */
function forCaller(
  caller: CallerRoles,
  step: { approverIds: string[]; facts: unknown },
  left: string[],
): { waitsForCaller: boolean; callerFinishes: boolean } {
  if (step.approverIds.includes(caller.id)) return { waitsForCaller: false, callerFinishes: false };
  if (caller.admin) return { waitsForCaller: true, callerFinishes: true };
  const spaces = new Set(parseStoredFacts(step.facts)?.spaceIds ?? []);
  const holds = (roleId: string) =>
    caller.orgRoleId === roleId || caller.spaceRoles.some((a) => a.roleId === roleId && spaces.has(a.spaceId));
  const held = left.filter(holds);
  return {
    waitsForCaller: held.length > 0,
    callerFinishes: held.length > 0 && held.length === left.length && left.length === 1,
  };
}
