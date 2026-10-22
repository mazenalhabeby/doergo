import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  activeWindowWhere,
  SERVICE_NAMES,
  type RuleFacts,
  type RuleKind,
  holdsOrgRole,
  roleNameOf,
  roleHolderIds,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { emitEvent, approvalSecondStepEvent } from '@hbcfield/shared/microservices';

/**
 * What applying and editing office rules share: open steps, the role a step asks
 * for and who holds it, and telling the second step.
 */
@Injectable()
export abstract class ApprovalRulesBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    @Inject(SERVICE_NAMES.NOTIFICATION) protected readonly notifications: ClientProxy,
  ) {}

  // ── helpers ───────────────────────────────────────────────────────────

  protected openStep(organizationId: string, kind: RuleKind, itemId: string) {
    return this.prisma.approvalStep.findFirst({ where: { organizationId, kind, itemId, consumedAt: null } });
  }

  protected async closeStepsOf(organizationId: string, ruleId: string) {
    await this.prisma.approvalStep.updateMany({
      where: { organizationId, ruleId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  protected async consume(id: string) {
    await this.prisma.approvalStep.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
  }

  protected async roleName(roleId: string): Promise<string> {
    return roleNameOf(this.prisma, roleId);
  }

  /** Holds the role org-wide, or as a workspace role in one of the item's workspaces — and it is active. */
  protected async holdsRole(
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

  /** Push the holders of the second role (never the first approver or the person it is about). */
  protected async tellSecondStep(
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
