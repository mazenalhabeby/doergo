import type { PrismaService, RuleKind } from '@hbcfield/shared';

/**
 * The open second step of one item, and closing steps. One OPEN step per item
 * is a partial unique index (see approval-rules.service.ts).
 */
export function openStep(
  prisma: PrismaService,
  organizationId: string,
  kind: RuleKind,
  itemId: string,
  aliases: string[] = [],
) {
  return prisma.approvalStep.findFirst({
    where: { organizationId, kind, itemId: { in: [itemId, ...aliases] }, consumedAt: null },
    orderBy: { firstAt: 'desc' },
  });
}

/** Mark one step used — only if nobody else did first. */
export async function consumeStep(prisma: PrismaService, id: string) {
  await prisma.approvalStep.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
}
