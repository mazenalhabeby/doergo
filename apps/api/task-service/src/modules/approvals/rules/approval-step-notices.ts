import type { Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { orgAdminIds, peopleNames, personName, roleHolderIds, type PrismaService } from '@hbcfield/shared';
import { emitEvent, approvalSecondStepEvent } from '@hbcfield/shared/microservices';
import type { RuleGateInput } from './approval-rules-helpers';

/**
 * Push the holders of the next role needed (never who already approved, or the person it is about). Nobody
 * holds it for this item's workspace (a workspace role the rule names for every workspace) → the
 * administrators, who can always finish it — an item must never wait for nobody, silently. Telling only:
 * a failure is logged, never thrown into the decision.
 */
export async function tellNextApprovers(
  prisma: PrismaService,
  notifications: ClientProxy,
  logger: Logger,
  roleId: string,
  input: Pick<
    RuleGateInput,
    'organizationId' | 'kind' | 'itemId' | 'facts' | 'deciderId' | 'subjectId' | 'subjectName'
  >,
  firstName: string,
  alsoExclude: string[] = [],
): Promise<void> {
  try {
    const exclude = [input.deciderId, ...(input.subjectId ? [input.subjectId] : []), ...alsoExclude];
    const { organizationId, facts } = input;
    let recipientIds = await roleHolderIds(prisma, {
      organizationId,
      roleId,
      spaceIds: facts.spaceIds,
      exclude,
      now: new Date(),
    });
    if (!recipientIds.length)
      recipientIds = (await orgAdminIds(prisma, organizationId, input.deciderId))
        .map((a) => a.id)
        .filter((id) => !exclude.includes(id));
    if (!recipientIds.length) return;
    // Whom it is about, by name ("approve Anna's hours") — read only when somebody is told.
    const subjectName =
      input.subjectName ?? (input.subjectId ? personName((await peopleNames(prisma, [input.subjectId]))[0] ?? {}) : '');
    emitEvent(notifications, approvalSecondStepEvent, {
      organizationId,
      recipientIds,
      kind: input.kind,
      itemId: input.itemId,
      firstName,
      subjectName,
    });
  } catch (e) {
    logger.warn(`second-step notice failed: ${(e as Error).message}`);
  }
}

type NoticeInput = Parameters<typeof tellNextApprovers>[4];

/**
 * A batch ("Approve all", days typed in together): the next approvers hear ONCE per role and workspace — after
 * the batch, not per item. About one person → named ("approve Anna's request"); about several → one general
 * line, and none of them is told about the others' items.
 */
export class BatchNotices {
  private readonly groups = new Map<
    string,
    { roleId: string; input: NoticeInput; firstName: string; subjects: Set<string> }
  >();

  add(roleId: string, input: NoticeInput, firstName: string): void {
    const key = `${roleId}|${[...input.facts.spaceIds].sort().join(',')}`;
    const group = this.groups.get(key) ?? { roleId, input, firstName, subjects: new Set<string>() };
    if (input.subjectId) group.subjects.add(input.subjectId);
    this.groups.set(key, group);
  }

  async flush(prisma: PrismaService, notifications: ClientProxy, logger: Logger): Promise<void> {
    for (const g of this.groups.values()) {
      const many = g.subjects.size > 1;
      const input = many ? { ...g.input, subjectId: undefined, subjectName: '' } : g.input;
      await tellNextApprovers(prisma, notifications, logger, g.roleId, input, g.firstName, many ? [...g.subjects] : []);
    }
    this.groups.clear();
  }
}
