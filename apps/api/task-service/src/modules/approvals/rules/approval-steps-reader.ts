import { Injectable } from '@nestjs/common';
import {
  approvalTurn,
  memberRolesNow,
  standInCovers,
  standInsAround,
  holdsRoleIn,
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
/** Item ids per step query — well under the database's parameter limit, however long the inbox. */
const STEP_IDS_PER_QUERY = 1000;

@Injectable()
export class ApprovalStepsReader {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ONE query each for steps (by id, in chunks), rules, people, roles and — when a caller is named — the caller's
   * own roles, however long the inbox. For the caller: does it wait for THEM, and does their approval finish it.
   */
  async steps(
    organizationId: string,
    items: Array<{ kind: RuleKind; itemId: string; spaceId?: string | null }>,
    callerId?: string,
  ): Promise<ApprovalStepView[]> {
    if (!items.length) return [];
    const wanted = new Set(items.map((i) => `${i.kind}:${i.itemId}`));
    const ids = [...new Set(items.map((i) => i.itemId))];
    const chunks = Array.from({ length: Math.ceil(ids.length / STEP_IDS_PER_QUERY) }, (_, n) =>
      ids.slice(n * STEP_IDS_PER_QUERY, (n + 1) * STEP_IDS_PER_QUERY),
    );
    const spaceOf = new Map(items.map((i) => [`${i.kind}:${i.itemId}`, i.spaceId ?? null]));
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
              firstAt: true,
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
    const since = new Date(Math.min(...rows.map((r) => r.firstAt.getTime())));
    const [people, roles, caller, standIns] = await Promise.all([
      peopleNames(this.prisma, [...new Set(rows.flatMap((r) => [r.firstById, ...r.approverIds]))]),
      roleNames(this.prisma, [...new Set([...leftOf.values()].flat())]),
      callerId ? memberRolesNow(this.prisma, organizationId, callerId, new Date()) : null,
      // The gate refuses a leader and the stand-in deciding with their authority as two approvals — so does the hint.
      callerId ? standInsAround(this.prisma, organizationId, [callerId], since) : [],
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
        // Only overtime is agreed in minutes; another kind's stored number is a fact, not an agreed time.
        agreedMinutes: r.kind === 'overtime' ? (r.minutes ?? null) : null,
        approverCount: new Set([r.firstById, ...r.approverIds]).size,
        approverNames: [...new Set([r.firstById, ...r.approverIds])]
          .map((id) => personById.get(id) ?? '')
          .filter(Boolean),
        ...(caller
          ? { turn: callerTurn(caller, standIns, r, leftOf.get(r)!, spaceOf.get(`${r.kind}:${r.itemId}`) ?? null) }
          : {}),
      }));
  }
}

type CallerRoles = NonNullable<Awaited<ReturnType<typeof memberRolesNow>>>;

/**
 * The caller's turn on one step, by the gate's own rule (shared `approvalTurn`): everyone who approved — the first
 * approver included — and their stand-ins are refused as the same person; it waits for the caller when they hold a
 * role still needed (org-wide, or in one of the item's workspaces).
 */
function callerTurn(
  caller: CallerRoles,
  standIns: Awaited<ReturnType<typeof standInsAround>>,
  step: { firstById: string; approverIds: string[]; firstAt: Date; facts: unknown },
  left: string[],
  itemSpaceId: string | null,
) {
  const earlier = [...new Set([step.firstById, ...step.approverIds])];
  // A step from before its facts were stored: the item's own workspace.
  const spaceIds = parseStoredFacts(step.facts)?.spaceIds ?? (itemSpaceId ? [itemSpaceId] : []);
  const { waitsForYou, youFinish, youApproved, adminFinishes } = approvalTurn({
    callerId: caller.id,
    admin: caller.admin,
    earlier,
    standInOf: earlier.filter((id) => id !== caller.id && standInCovers(standIns, caller.id, [id], step.firstAt)),
    left,
    heldLeft: left.filter((r) => holdsRoleIn(caller, r, spaceIds)),
  });
  return { waitsForYou, youFinish, youApproved, adminFinishes };
}
