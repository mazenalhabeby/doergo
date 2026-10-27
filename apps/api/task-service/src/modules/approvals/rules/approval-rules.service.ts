import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  personName,
  rulesThatApply,
  requiredRoleIds,
  type RuleFacts,
  type RuleKind,
  roleNames,
  personRoleAndName,
  SERVICE_NAMES,
  heldRoleIds,
  roleHolderIds,
  orgAdminIds,
  standInBetween,
  PrismaService,
} from '@hbcfield/shared';
import { emitEvent, approvalSecondStepEvent } from '@hbcfield/shared/microservices';
import type { Decided, GateVerdict, RuleGateInput } from './approval-rules-helpers';
import { consumeStep, openStep, stepRules, storedFacts } from './approval-steps';

export { type Decided, type GateVerdict, type RuleGateInput } from './approval-rules-helpers';

/**
 * OFFICE RULES, enforced where the decision is made (shared `approval-rules.ts`).
 *
 * Each kind's approve path calls `decide()` after its own permission and second-party checks, around its write.
 * No rule applies → it finishes as always. Rules apply → EVERY one of them counts (decided 2026-10-27):
 *   • nobody has approved yet: this approval is recorded as step 1, nothing is written, and the holders of the
 *     first role still needed are told;
 *   • then each role the rules name is given by somebody ELSE holding it, one person each — never the same
 *     person twice, never a leader and their stand-in as two (`SECOND_STEP_SAME_PERSON` /
 *     `SECOND_STEP_REQUIRED` otherwise); the last one finishes it.
 * An active administrator finishes at once. A rejection, by anybody who may decide, drops the open step (`clear`).
 *
 * ⚠️ One OPEN step per item is a partial unique index: two people approving first at the same moment cannot
 * both "go first".
 */
@Injectable()
export class ApprovalRulesService {
  private readonly logger = new Logger(ApprovalRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) private readonly notifications: ClientProxy,
  ) {}

  /**
   * THE approve path around its write. Not every approval given yet → `{ waiting }` and nothing is written (the
   * gateway reads `stage`). Otherwise the write runs with the minutes the approvers agreed (overtime: the smallest
   * any of them gave) and, if it throws, the step is opened again — the approvals already given are never lost.
   * Unless the item was decided or removed meanwhile (404 / 409): then there is nothing left to approve.
   */
  async decide<T>(input: RuleGateInput, write: (agreedMinutes?: number) => Promise<T>): Promise<Decided<T>> {
    const verdict = await this.gate(input);
    if (!verdict.finalize) return { waiting: { stage: 'FIRST_STEP', waitingFor: verdict.roleName } };
    try {
      return { done: await write(verdict.minutes) };
    } catch (e) {
      const gone = e instanceof HttpException && [404, 409].includes(e.getStatus());
      if (!gone) await this.reopen(verdict.stepId);
      throw e;
    }
  }

  /** The gate itself — approve paths call `decide()`, which wraps their write in it. Public for its spec. */
  async gate(input: RuleGateInput, retried = false): Promise<GateVerdict> {
    const rules = await stepRules(this.prisma, input.organizationId, [input.kind]);
    const steps = await openStep(this.prisma, input.organizationId, input.kind, input.itemId, input.itemAliases);
    // Two runs that became one each had a step: the newest stands, the other's approvals are not carried over.
    for (const older of steps.slice(1)) await consumeStep(this.prisma, older.id);
    const open = steps[0] ?? null;
    // EVERY rule that applies counts — one approver per role they name (shared `requiredRoleIds`).
    const required = requiredRoleIds(rules, input.facts);
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
    const deciderName = decider ? personName(decider) : '';

    if (!open) {
      const first = rulesThatApply(rules, input.facts)[0];
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
            facts: storedFacts(input.facts),
          },
        });
      } catch (e) {
        // Somebody went first a moment ago: this is now the next step, judged as one (once).
        if (retried) throw e;
        return this.gate(input, true);
      }
      if (!input.quiet) await this.tellNext(required[0], input, deciderName);
      return { finalize: false, roleName: await this.roleLabel(required) };
    }

    // The step was opened under an earlier id of this item (a run that grew): it follows the item.
    if (open.itemId !== input.itemId)
      await this.prisma.approvalStep.updateMany({ where: { id: open.id }, data: { itemId: input.itemId } });
    // Rules may have changed since: what is needed now, minus what was already given.
    const left = required.filter((r) => !open.doneRoleIds.includes(r));
    const leftNames = await this.roleLabel(left.length ? left : required);
    /*
      Every role already given (a step opened again after a write failed, or rules that asked less since): this
      is the retry of a finished decision — whoever may decide finishes it, earlier approvers included.
      Otherwise nobody gives two of the approvals: not the same person (`firstById` covers steps from before
      `approverIds`), and not a leader and the stand-in deciding with the leader's authority.
    */
    const earlier = [...new Set([open.firstById, ...open.approverIds])];
    if (
      left.length &&
      (earlier.includes(input.deciderId) ||
        (await standInBetween(this.prisma, input.organizationId, input.deciderId, earlier, new Date())))
    ) {
      throw new ConflictException({
        message: `This needs another approval by ${leftNames}.`,
        code: 'SECOND_STEP_SAME_PERSON',
        params: { role: leftNames },
      });
    }
    const held = await heldRoleIds(this.prisma, {
      userId: input.deciderId,
      organizationId: input.organizationId,
      roleIds: left,
      spaceIds: input.facts.spaceIds,
      now: new Date(),
    });
    const given = held[0] ?? null;
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
        facts: storedFacts(input.facts),
        ...(stillLeft.length ? {} : { consumedAt: new Date() }),
      },
    });
    if (!count)
      throw new ConflictException({ message: 'Somebody else decided this a moment ago.', code: 'SECOND_STEP_TAKEN' });
    if (stillLeft.length) {
      if (!input.quiet) await this.tellNext(stillLeft[0], input, deciderName);
      return { finalize: false, roleName: await this.roleLabel(stillLeft) };
    }
    return { finalize: true, stepId: open.id, ...(minutes != null ? { minutes } : {}) };
  }

  /**
   * The write after the last approval failed (a contract that could not be applied, a flow that does not exist):
   * the approvals already given stay, so the next try is not a fresh step 1. Only if nothing else opened since —
   * that conflict (the partial unique index) is the one error expected here; anything else is logged and thrown.
   */
  async reopen(stepId: string | undefined): Promise<void> {
    if (!stepId) return;
    try {
      await this.prisma.approvalStep.updateMany({ where: { id: stepId }, data: { consumedAt: null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      this.logger.error(`could not reopen approval step ${stepId}: ${(e as Error).message}`);
      throw e;
    }
  }

  /** Would a decision like this need more approvals, and by which roles? For the member's pre-check. */
  async secondStepFor(organizationId: string, kind: RuleKind, facts: RuleFacts): Promise<string | null> {
    const required = requiredRoleIds(await stepRules(this.prisma, organizationId, [kind]), facts);
    return required.length ? this.roleLabel(required) : null;
  }

  /** `secondStepFor` for a batch of items of one kind — the rules read once. True = more approvals needed. */
  async needsMoreFor(organizationId: string, kind: RuleKind, facts: RuleFacts[]): Promise<boolean[]> {
    const rules = await stepRules(this.prisma, organizationId, [kind]);
    return facts.map((f) => requiredRoleIds(rules, f).length > 0);
  }

  /** Does any active rule of this kind ask about cover? (Cover is only computed then.) */
  async asksAboutCover(organizationId: string): Promise<boolean> {
    return (
      (await this.prisma.approvalRule.count({
        where: { organizationId, kind: 'request', isActive: true, whenCoverShort: true },
      })) > 0
    );
  }

  /** A rejection — by anybody who may decide — ends the two-step for this item. */
  async clear(organizationId: string, kind: RuleKind, itemId: string | string[]): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, kind, itemId: { in: [itemId].flat() }, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /** A step opened before `since` is about an earlier version of the item (an overtime round that lapsed): it ends. */
  async clearBefore(organizationId: string, kind: RuleKind, itemId: string, since: Date): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, kind, itemId, consumedAt: null, firstAt: { lt: since } },
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

  // ── telling the next approvers ─────────────────────────────────────────

  /** The roles still needed, in words ("HR + Finance"). */
  private async roleLabel(roleIds: string[]): Promise<string> {
    const roles = await roleNames(this.prisma, roleIds);
    return roleIds
      .map((id) => roles.find((r) => r.id === id)?.name ?? '')
      .filter(Boolean)
      .join(' + ');
  }

  /**
   * Push the holders of the next role needed (never who already approved, or the person it is about). Nobody
   * holds it for this item's workspace (a workspace role the rule names for every workspace) → the
   * administrators, who can always finish it — an item must never wait for nobody, silently.
   */
  private async tellNext(roleId: string, input: RuleGateInput, firstName: string) {
    try {
      const exclude = [input.deciderId, ...(input.subjectId ? [input.subjectId] : [])];
      const now = new Date();
      const { organizationId, facts } = input;
      let recipientIds = await roleHolderIds(this.prisma, {
        organizationId,
        roleId,
        spaceIds: facts.spaceIds,
        exclude,
        now,
      });
      if (!recipientIds.length)
        recipientIds = (await orgAdminIds(this.prisma, organizationId, input.deciderId))
          .map((a) => a.id)
          .filter((id) => !exclude.includes(id));
      if (!recipientIds.length) return;
      emitEvent(this.notifications, approvalSecondStepEvent, {
        organizationId,
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
