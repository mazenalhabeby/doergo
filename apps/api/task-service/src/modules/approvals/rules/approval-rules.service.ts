// size-exempt: the office-rules gate read top to bottom — who decides, which rules apply, which step is open
import { ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  personName,
  rulesThatApply,
  requiredRoleIds,
  type ApprovalStepView,
  type RuleFacts,
  type RuleKind,
  roleNames,
  peopleNames,
  personRoleAndName,
  activeWindowWhere,
  SERVICE_NAMES,
  holdsOrgRole,
  roleHolderIds,
  PrismaService,
} from '@hbcfield/shared';
import { emitEvent, approvalSecondStepEvent } from '@hbcfield/shared/microservices';
import { GateVerdict } from './approval-rules-helpers';
import { consumeStep, openStep } from './approval-steps';

export { type GateVerdict } from './approval-rules-helpers';

/**
 * OFFICE RULES, enforced where the decision is made (shared `approval-rules.ts`).
 *
 * Each kind's approve path calls `gate()` after its own permission and
 * second-party checks and before it writes. No rule applies → it finishes as
 * always. Rules apply → EVERY one of them counts (decided 2026-10-27):
 *   • nobody has approved yet: this approval is recorded as step 1, the item
 *     stays waiting, and the holders of the first role still needed are told;
 *   • then each role the rules name is given by somebody ELSE holding it, one
 *     person each (`SECOND_STEP_SAME_PERSON` / `SECOND_STEP_REQUIRED` otherwise);
 *     the last one finishes it.
 * An administrator finishes at once. A rejection, by anybody who may decide,
 * drops the open step (`clear`).
 *
 * ⚠️ One OPEN step per item is a partial unique index: two people approving
 * first at the same moment cannot both "go first".
 */
@Injectable()
export class ApprovalRulesService {
  private readonly logger = new Logger(ApprovalRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  async gate(
    input: {
      organizationId: string;
      kind: RuleKind;
      itemId: string;
      facts: RuleFacts;
      deciderId: string;
      subjectId?: string | null;
      subjectName?: string | null;
      /**
       * Earlier ids of the SAME item: a run of missed days is keyed on its newest day, so when another day joins
       * the run the step opened on the old newest day is found — and moved — instead of being lost.
       */
      itemAliases?: string[];
    },
    retried = false,
  ): Promise<GateVerdict> {
    // Only rules with a SECOND STEP gate a decision; reminder-only rules are the sweep's.
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId: input.organizationId, kind: input.kind, isActive: true, secondRoleId: { not: null } },
      orderBy: { createdAt: 'asc' },
    });
    const open = await openStep(this.prisma, input.organizationId, input.kind, input.itemId, input.itemAliases);
    // EVERY rule that applies counts — one approver per role they name (shared `requiredRoleIds`).
    const required = requiredRoleIds(rules as never[], input.facts);
    if (!required.length) {
      if (open) await consumeStep(this.prisma, open.id);
      return { finalize: true };
    }

    const decider = await personRoleAndName(this.prisma, input.deciderId, input.organizationId);
    if (decider?.role === 'ADMIN') {
      if (open) await consumeStep(this.prisma, open.id);
      return { finalize: true, ...(open ? { stepId: open.id } : {}) };
    }

    if (!open) {
      const first = rulesThatApply(rules as never[], input.facts)[0] as (typeof rules)[number];
      try {
        await this.prisma.approvalStep.create({
          data: {
            organizationId: input.organizationId,
            kind: input.kind,
            itemId: input.itemId,
            ruleId: first.id,
            firstById: input.deciderId,
            approverIds: [input.deciderId],
            requiredRoleIds: required,
            minutes: input.facts.minutes ?? null,
          },
        });
      } catch (e) {
        // Somebody went first a moment ago: this is now the next step, judged as one (once).
        if (retried) throw e;
        return this.gate(input, true);
      }
      await this.tellNext(required[0], input, decider ? personName(decider) : '');
      return { finalize: false, roleName: await this.namesOf(required) };
    }

    // The step was opened under an earlier id of this item (a run that grew): it follows the item.
    if (open.itemId !== input.itemId)
      await this.prisma.approvalStep.updateMany({ where: { id: open.id }, data: { itemId: input.itemId } });
    // Rules may have changed since: what is needed now, minus what was already given.
    const left = required.filter((r) => !open.doneRoleIds.includes(r));
    const leftNames = await this.namesOf(left.length ? left : required);
    if (open.firstById === input.deciderId || open.approverIds.includes(input.deciderId)) {
      throw new ConflictException({
        message: `This needs another approval by ${leftNames}.`,
        code: 'SECOND_STEP_SAME_PERSON',
        params: { role: leftNames },
      });
    }
    let given: string | null = null;
    for (const roleId of left)
      if (await this.holdsRole(input.organizationId, input.deciderId, roleId, input.facts.spaceIds)) {
        given = roleId;
        break;
      }
    if (left.length && !given) {
      throw new ForbiddenException({
        message: `The next approval is for ${leftNames}.`,
        code: 'SECOND_STEP_REQUIRED',
        params: { role: leftNames },
      });
    }
    const stillLeft = left.filter((r) => r !== given);
    // Claimed, not read-then-written: two people cannot both give the same approval.
    const { count } = await this.prisma.approvalStep.updateMany({
      where: { id: open.id, consumedAt: null, doneRoleIds: { equals: open.doneRoleIds } },
      data: {
        doneRoleIds: given ? [...open.doneRoleIds, given] : open.doneRoleIds,
        approverIds: [...open.approverIds, input.deciderId],
        requiredRoleIds: required,
        ...(stillLeft.length ? {} : { consumedAt: new Date() }),
      },
    });
    if (!count)
      throw new ConflictException({ message: 'Somebody else decided this a moment ago.', code: 'SECOND_STEP_TAKEN' });
    if (stillLeft.length) {
      await this.tellNext(stillLeft[0], input, decider ? personName(decider) : '');
      return { finalize: false, roleName: await this.namesOf(stillLeft) };
    }
    // Overtime: never more than the first person agreed to.
    const minutes =
      open.minutes != null && input.facts.minutes != null ? Math.min(open.minutes, input.facts.minutes) : undefined;
    return { finalize: true, stepId: open.id, ...(minutes != null ? { minutes } : {}) };
  }

  /**
   * The write after the last approval failed (a contract that could not be applied, a flow that does not exist):
   * the approvals already given stay, so the next try is not a fresh step 1. Only if nothing else opened since.
   */
  async reopen(stepId: string | undefined): Promise<void> {
    if (!stepId) return;
    try {
      await this.prisma.approvalStep.updateMany({ where: { id: stepId }, data: { consumedAt: null } });
    } catch {
      // Another step opened meanwhile (the partial unique index): that one stands.
    }
  }

  /** Would a decision like this need more approvals, and by which roles? For the member's pre-check. */
  async secondStepFor(organizationId: string, kind: RuleKind, facts: RuleFacts): Promise<string | null> {
    const rules = await this.prisma.approvalRule.findMany({
      where: { organizationId, kind, isActive: true, secondRoleId: { not: null } },
    });
    const required = requiredRoleIds(rules as never[], facts);
    return required.length ? this.namesOf(required) : null;
  }

  /** Does any active rule of this kind ask about cover? (Cover is only computed then.) */
  async asksAboutCover(organizationId: string): Promise<boolean> {
    return (
      (await this.prisma.approvalRule.count({
        where: { organizationId, kind: 'request', isActive: true, whenCoverShort: true },
      })) > 0
    );
  }

  /**
   * `gate` for an approve path that only needs to know whether to stop: null = go on and write; otherwise
   * step 1 of 2 is recorded and this is what to answer (the gateway reads `stage`).
   */
  async firstStep(input: Parameters<ApprovalRulesService['gate']>[0]) {
    const verdict = await this.gate(input);
    return verdict.finalize ? null : { stage: 'FIRST_STEP' as const, waitingFor: verdict.roleName };
  }

  /** A rejection — by anybody who may decide — ends the two-step for this item. */
  async clear(organizationId: string, kind: RuleKind, itemId: string): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, kind, itemId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /** The open first steps for these items, for the inbox. ONE query each for steps, people and roles. */
  async steps(organizationId: string, items: Array<{ kind: RuleKind; itemId: string }>): Promise<ApprovalStepView[]> {
    if (!items.length) return [];
    const rows = await this.prisma.approvalStep.findMany({
      where: {
        organizationId,
        consumedAt: null,
        OR: items.slice(0, 2000).map((i) => ({ kind: i.kind, itemId: i.itemId })),
      },
      select: { kind: true, itemId: true, firstById: true, requiredRoleIds: true, doneRoleIds: true },
    });
    if (!rows.length) return [];
    const left = (r: (typeof rows)[number]) => r.requiredRoleIds.filter((x) => !r.doneRoleIds.includes(x));
    const [people, roles] = await Promise.all([
      peopleNames(this.prisma, [...new Set(rows.map((r) => r.firstById))]),
      roleNames(this.prisma, [...new Set(rows.flatMap(left))]),
    ]);
    const personById = new Map(people.map((p) => [p.id, personName(p)]));
    const roleById = new Map(roles.map((r) => [r.id, r.name]));
    return rows.map((r) => ({
      kind: r.kind as RuleKind,
      itemId: r.itemId,
      firstById: r.firstById,
      firstByName: personById.get(r.firstById) ?? '',
      roleName: left(r)
        .map((id) => roleById.get(id) ?? '')
        .filter(Boolean)
        .join(' + '),
    }));
  }

  // ── who holds the second step's role, and telling them ─────────────────

  /** The roles still needed, in words ("HR + Finance"). */
  private async namesOf(roleIds: string[]): Promise<string> {
    const roles = await roleNames(this.prisma, roleIds);
    return roleIds
      .map((id) => roles.find((r) => r.id === id)?.name ?? '')
      .filter(Boolean)
      .join(' + ');
  }

  /** Holds the role org-wide, or as a workspace role in one of the item's workspaces — and it is active. */
  private async holdsRole(
    organizationId: string,
    userId: string,
    roleId: string,
    spaceIds: string[],
  ): Promise<boolean> {
    const now = new Date();
    const [org, space] = await Promise.all([
      holdsOrgRole(this.prisma, userId, organizationId, roleId),
      spaceIds.length
        ? this.prisma.spaceAssignment.findFirst({
            where: {
              userId,
              organizationId,
              roleId,
              spaceId: { in: spaceIds },
              role: { isActive: true },
              ...activeWindowWhere(now),
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return !!org || !!space;
  }

  /** Active holders of a role — org-wide, or as a workspace role in one of these workspaces. */
  async holdersOf(
    organizationId: string,
    roleId: string,
    spaceIds: string[],
    exclude: string[] = [],
  ): Promise<string[]> {
    const now = new Date();
    return roleHolderIds(this.prisma, { organizationId, roleId, spaceIds, exclude, now });
  }

  /** Push the holders of the next role needed (never who already approved, or the person it is about). */
  private async tellNext(
    roleId: string,
    input: {
      organizationId: string;
      kind: RuleKind;
      itemId: string;
      facts: RuleFacts;
      deciderId: string;
      subjectId?: string | null;
      subjectName?: string | null;
    },
    firstName: string,
  ) {
    try {
      const recipientIds = await this.holdersOf(input.organizationId, roleId, input.facts.spaceIds, [
        input.deciderId,
        ...(input.subjectId ? [input.subjectId] : []),
      ]);
      if (!recipientIds.length) return;
      emitEvent(this.notifications, approvalSecondStepEvent, {
        organizationId: input.organizationId,
        recipientIds,
        kind: input.kind,
        itemId: input.itemId,
        firstName,
        subjectName: input.subjectName ?? '',
      });
    } catch (e) {
      this.logger.warn(`second-step notice failed: ${(e as Error).message}`);
    }
  }
}
