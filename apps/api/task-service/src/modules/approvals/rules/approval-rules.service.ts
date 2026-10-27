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
import { type Decided, GateVerdict } from './approval-rules-helpers';
import { consumeStep, openStep } from './approval-steps';

export { type Decided, type GateVerdict } from './approval-rules-helpers';

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
      /**
       * Overtime: the minutes THIS decision agrees to, when the rule is judged on more (the shift's whole overtime,
       * earlier rounds included — so 59-minute rounds are no way round a one-hour rule). Defaults to the facts' own.
       */
      agreeMinutes?: number;
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
    // An administrator finishes it at once — an ACTIVE one (a deactivated account decides nothing).
    if (decider?.role === 'ADMIN' && decider.isActive) {
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
            minutes: input.agreeMinutes ?? input.facts.minutes ?? null,
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
    /*
      Every role already given (a step opened again after a write failed, or rules that asked less since): this
      is the retry of a finished decision — whoever may decide finishes it, earlier approvers included.
      Otherwise nobody gives two of the approvals.
    */
    if (left.length && (open.firstById === input.deciderId || open.approverIds.includes(input.deciderId))) {
      throw new ConflictException({
        message: `This needs another approval by ${leftNames}.`,
        code: 'SECOND_STEP_SAME_PERSON',
        params: { role: leftNames },
      });
    }
    const holds = await Promise.all(
      left.map((roleId) => this.holdsRole(input.organizationId, input.deciderId, roleId, input.facts.spaceIds)),
    );
    const given = left[holds.indexOf(true)] ?? null;
    if (left.length && !given) {
      throw new ForbiddenException({
        message: `The next approval is for ${leftNames}.`,
        code: 'SECOND_STEP_REQUIRED',
        params: { role: leftNames },
      });
    }
    const stillLeft = left.filter((r) => r !== given);
    // Overtime: never more than ANY earlier approver agreed to — the step keeps the smallest.
    const agree = input.agreeMinutes ?? input.facts.minutes;
    const minutes =
      open.minutes != null && agree != null ? Math.min(open.minutes, agree) : (open.minutes ?? agree ?? null);
    // Claimed, not read-then-written: two people cannot both give the same approval.
    const { count } = await this.prisma.approvalStep.updateMany({
      where: { id: open.id, consumedAt: null, doneRoleIds: { equals: open.doneRoleIds } },
      data: {
        doneRoleIds: given ? [...open.doneRoleIds, given] : open.doneRoleIds,
        approverIds: [...new Set([...open.approverIds, input.deciderId])],
        requiredRoleIds: required,
        minutes,
        ...(stillLeft.length ? {} : { consumedAt: new Date() }),
      },
    });
    if (!count)
      throw new ConflictException({ message: 'Somebody else decided this a moment ago.', code: 'SECOND_STEP_TAKEN' });
    if (stillLeft.length) {
      await this.tellNext(stillLeft[0], input, decider ? personName(decider) : '');
      return { finalize: false, roleName: await this.namesOf(stillLeft) };
    }
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
   * THE approve path around its write. Not every approval given yet → `{ waiting }` and nothing is written (the
   * gateway reads `stage`). Otherwise the write runs with the minutes the approvers agreed (overtime: the smallest
   * any of them gave) and, if it throws, the step is opened again — the approvals already given are never lost.
   */
  async decide<T>(
    input: Parameters<ApprovalRulesService['gate']>[0],
    write: (agreedMinutes?: number) => Promise<T>,
  ): Promise<Decided<T>> {
    const verdict = await this.gate(input);
    if (!verdict.finalize) return { waiting: { stage: 'FIRST_STEP', waitingFor: verdict.roleName } };
    try {
      return { done: await write(verdict.minutes) };
    } catch (e) {
      await this.reopen(verdict.stepId);
      throw e;
    }
  }

  /** A rejection — by anybody who may decide — ends the two-step for this item. */
  async clear(organizationId: string, kind: RuleKind, itemId: string | string[]): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, kind, itemId: { in: [itemId].flat() }, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /** The item itself is gone (a request withdrawn): its half-way step ends too. Ids are unique across organizations. */
  async clearItem(kind: RuleKind, itemId: string): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { kind, itemId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /** The open first steps for these items, for the inbox. ONE query each for steps, people and roles. */
  async steps(organizationId: string, items: Array<{ kind: RuleKind; itemId: string }>): Promise<ApprovalStepView[]> {
    if (!items.length) return [];
    // Only OPEN steps (few), read by id in chunks — every item asked, however long the inbox.
    const wanted = new Set(items.map((i) => `${i.kind}:${i.itemId}`));
    const ids = [...new Set(items.map((i) => i.itemId))];
    const chunks = Array.from({ length: Math.ceil(ids.length / 1000) }, (_, n) => ids.slice(n * 1000, n * 1000 + 1000));
    const rows = (
      await Promise.all(
        chunks.map((chunk) =>
          this.prisma.approvalStep.findMany({
            where: { organizationId, consumedAt: null, itemId: { in: chunk } },
            select: { kind: true, itemId: true, firstById: true, requiredRoleIds: true, doneRoleIds: true },
          }),
        ),
      )
    )
      .flat()
      .filter((r) => wanted.has(`${r.kind}:${r.itemId}`));
    if (!rows.length) return [];
    // What is still needed, read against the rules as they are NOW — a role no active rule names is not waited for.
    const named = await this.prisma.approvalRule.findMany({
      where: {
        organizationId,
        isActive: true,
        secondRoleId: { not: null },
        kind: { in: [...new Set(rows.map((r) => r.kind))] },
      },
      select: { kind: true, secondRoleId: true },
    });
    const asked = new Set(named.map((r) => `${r.kind}:${r.secondRoleId}`));
    const left = (r: (typeof rows)[number]) =>
      r.requiredRoleIds.filter((x) => !r.doneRoleIds.includes(x) && asked.has(`${r.kind}:${x}`));
    const [people, roles] = await Promise.all([
      peopleNames(this.prisma, [...new Set(rows.map((r) => r.firstById))]),
      roleNames(this.prisma, [...new Set(rows.flatMap(left))]),
    ]);
    const personById = new Map(people.map((p) => [p.id, personName(p)]));
    const roleById = new Map(roles.map((r) => [r.id, r.name]));
    return rows
      .filter((r) => left(r).length)
      .map((r) => ({
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
