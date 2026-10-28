import { roleHolderIds, standInCovers, standInsAround, type PrismaService, type RuleKind } from '@hbcfield/shared';
import { openStep, parseStoredFacts, rolesStillNeeded, stepRules } from './approval-steps';
import type { WorkspaceDecider } from './workspace-deciders';

/**
 * "Who else can decide" for an item HALF-WAY through office rules: only who can still give a missing approval — an
 * administrator (finishes it), or somebody holding a role still needed here who has not approved and is not a
 * stand-in of anybody who did (the shared turn rule, `approvalTurn`). Listing the first approver, or people
 * without the missing role, named people the approval would refuse. Not half-way → the list as it was.
 */
export async function stillNeededBy(
  prisma: PrismaService,
  organizationId: string,
  step: { kind: RuleKind; itemId: string } | null | undefined,
  deciders: WorkspaceDecider[],
): Promise<WorkspaceDecider[]> {
  if (!step) return deciders;
  const [open] = await openStep(prisma, organizationId, step.kind, step.itemId);
  if (!open) return deciders;
  const left = rolesStillNeeded(open, await stepRules(prisma, organizationId, [step.kind]));
  if (!left.length) return deciders;
  const earlier = [...new Set([open.firstById, ...open.approverIds])];
  const spaceIds = parseStoredFacts(open.facts)?.spaceIds ?? [];
  const now = new Date();
  const [holderLists, standIns] = await Promise.all([
    Promise.all(
      left.map((roleId) => roleHolderIds(prisma, { organizationId, roleId, spaceIds, exclude: earlier, now })),
    ),
    standInsAround(prisma, organizationId, earlier, open.firstAt),
  ]);
  const holders = new Set(holderLists.flat());
  return deciders.filter(
    (d) =>
      d.via === 'ADMIN' ||
      (holders.has(d.id) && !earlier.includes(d.id) && !standInCovers(standIns, d.id, earlier, open.firstAt)),
  );
}
