import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import {
  personName,
  pickRule,
  requiredRoleIds,
  type RuleFacts,
  type RuleKind,
  roleNames,
  personRoleAndName,
  SERVICE_NAMES,
  heldRoleIds,
  standInBetween,
  PrismaService,
} from '@hbcfield/shared';
import type { Decided, GateVerdict, RuleGateInput } from './approval-rules-helpers';
import { consumeStep, joinRoleNames, openStep, stepCreateData, stepRules, storedFacts } from './approval-steps';
import { tellNextApprovers } from './approval-step-notices';
import { CHANGED_MEANWHILE } from './already-decided';

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
      const changed = (e as { response?: { code?: string } }).response?.code === CHANGED_MEANWHILE;
      const gone = e instanceof HttpException && [404, 409].includes(e.getStatus()) && !changed;
      if (!gone) await this.reopen(verdict.stepId);
      throw e;
    }
  }

  /** The gate itself — approve paths only ever reach it through `decide()`, around their write. */
  private async gate(input: RuleGateInput, retried = false): Promise<GateVerdict> {
    const rules = await stepRules(this.prisma, input.organizationId, [input.kind]);
    // No rule of this kind at all — the usual case: one query, nothing else to read (a step can only wait on a rule).
    if (!rules.length) return { finalize: true };
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
      const first = pickRule(rules, input.facts)!;
      try {
        await this.prisma.approvalStep.create({
          data: stepCreateData(input, {
            ...input,
            ruleId: first.id,
            required,
            minutes: input.agreeMinutes,
          }),
        });
      } catch (e) {
        // Somebody went first a moment ago (the partial unique index): this is now the next step, judged as one.
        if (retried || !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        return this.gate(input, true);
      }
      await this.tellNext(required[0], input, deciderName);
      return { finalize: false, roleName: await this.roleLabel(required) };
    }

    // The step was opened under an earlier id of this item (a run that grew): it follows the item.
    if (open.itemId !== input.itemId)
      await this.prisma.approvalStep.updateMany({ where: { id: open.id }, data: { itemId: input.itemId } });
    // Rules may have changed since: what is needed now, minus what was already given.
    const left = required.filter((r) => !open.doneRoleIds.includes(r));
    /*
      Every role already given (a step opened again after a write failed, or rules that asked less since): this
      is the retry of a finished decision — whoever may decide finishes it, earlier approvers included.
      Otherwise nobody gives two of the approvals: not the same person (`firstById` covers steps from before
      `approverIds`), and not a leader and the stand-in deciding with the leader's authority.
    */
    const earlier = [...new Set([open.firstById, ...open.approverIds])];
    const leftNames = left.length ? await this.roleLabel(left) : '';
    if (
      left.length &&
      (earlier.includes(input.deciderId) ||
        (await standInBetween(this.prisma, input.organizationId, input.deciderId, earlier, open.firstAt)))
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
      await this.tellNext(stillLeft[0], input, deciderName);
      return { finalize: false, roleName: await this.roleLabel(stillLeft) };
    }
    return { finalize: true, stepId: open.id, ...(minutes != null ? { minutes } : {}) };
  }

  /**
   * The FIRST approval of a batch of NEW items of one kind (days the office typed in together), judged as `decide()`
   * judges each — in a fixed number of queries, however many days. Returns the ids it finishes (no rule applies,
   * or an active administrator); the caller writes those. The rest wait with their step opened, and the next
   * approvers are told once for the batch.
   */
  async firstOfMany(
    input: Pick<RuleGateInput, 'organizationId' | 'kind' | 'deciderId' | 'subjectId' | 'subjectName'>,
    items: Array<{ itemId: string; facts: RuleFacts }>,
  ): Promise<string[]> {
    const rules = await stepRules(this.prisma, input.organizationId, [input.kind]);
    const judged = items.map((i) => ({ ...i, required: requiredRoleIds(rules, i.facts) }));
    const waiting = judged.filter((i) => i.required.length);
    if (!waiting.length) return items.map((i) => i.itemId);
    const decider = await personRoleAndName(this.prisma, input.deciderId, input.organizationId);
    if (decider?.role === 'ADMIN' && decider.isActive) return items.map((i) => i.itemId);
    await this.prisma.approvalStep.createMany({
      data: waiting.map((i) => stepCreateData(input, { ...i, ruleId: pickRule(rules, i.facts)!.id })),
      // A new item has no open step; a retry of the same batch finds the ones it opened (the partial unique index).
      skipDuplicates: true,
    });
    // Each group the batch reaches (the first role still needed, in its workspace) is told once.
    const toldOnce = new Set<string>();
    const name = decider ? personName(decider) : '';
    for (const i of waiting)
      await this.tellNext(i.required[0], { ...input, itemId: i.itemId, facts: i.facts, toldOnce }, name);
    return judged.filter((i) => !i.required.length).map((i) => i.itemId);
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
  async approvalsNeededFor(organizationId: string, kind: RuleKind, facts: RuleFacts): Promise<string | null> {
    const required = requiredRoleIds(await stepRules(this.prisma, organizationId, [kind]), facts);
    return required.length ? this.roleLabel(required) : null;
  }

  /** `approvalsNeededFor` for a batch of items of one kind — the rules read once. True = more approvals needed. */
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

  /** A rejection — by anybody who may decide — ends the approvals half-way for this item. */
  async clear(organizationId: string, kind: RuleKind, itemId: string | string[]): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, kind, itemId: { in: [itemId].flat() }, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /**
   * A step opened before `since` is about an earlier version of the item (an overtime round that lapsed): it ends.
   * So do the reminders said about it — the new round (same shift, same key) is reminded about on its own.
   */
  async clearBefore(organizationId: string, kind: RuleKind, itemId: string, since: Date): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, kind, itemId, consumedAt: null, firstAt: { lt: since } },
      data: { consumedAt: new Date() },
    });
    await this.prisma.approvalNotice.deleteMany({ where: { organizationId, kind, itemId, sentAt: { lt: since } } });
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
    return joinRoleNames(roleIds, new Map(roles.map((r) => [r.id, r.name])));
  }

  /** The holders of the next role needed are told (approval-step-notices.ts) — once per role and workspace in a batch. */
  private async tellNext(roleId: string, input: RuleGateInput, firstName: string) {
    const key = `${roleId}|${[...input.facts.spaceIds].sort().join(',')}`;
    if (input.toldOnce?.has(key)) return;
    input.toldOnce?.add(key);
    await tellNextApprovers(this.prisma, this.notifications, this.logger, roleId, input, firstName);
  }
}
