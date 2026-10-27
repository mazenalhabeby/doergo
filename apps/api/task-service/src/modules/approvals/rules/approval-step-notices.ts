import type { Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { orgAdminIds, roleHolderIds, type PrismaService } from '@hbcfield/shared';
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
): Promise<void> {
  try {
    const exclude = [input.deciderId, ...(input.subjectId ? [input.subjectId] : [])];
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
    emitEvent(notifications, approvalSecondStepEvent, {
      organizationId,
      recipientIds,
      kind: input.kind,
      itemId: input.itemId,
      firstName,
      subjectName: input.subjectName ?? '',
    });
  } catch (e) {
    logger.warn(`second-step notice failed: ${(e as Error).message}`);
  }
}
