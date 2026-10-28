import {
  approvalTurn,
  roleHolderIds,
  standInCovers,
  standInsAround,
  type PrismaService,
  type RuleKind,
} from '@hbcfield/shared';
import { openStep, parseStoredFacts, rolesStillNeeded, stepRules } from './approval-steps';
import type { WorkspaceDecider } from './workspace-deciders';

/**
 * "Who else can decide" for an item HALF-WAY through office rules: only the people whose turn it is, by the shared
 * turn rule (`approvalTurn`) the approval itself refuses by — an administrator, or somebody holding a role still
 * needed here who has not approved and is not a stand-in of anybody who did; on the retry of a finished step,
 * anybody but the one who gave every approval. Not half-way → the list as it was.
 */
export async function stillNeededBy(
  prisma: PrismaService,
  organizationId: string,
  step: { kind: RuleKind; itemId: string } | null | undefined,
  deciders: WorkspaceDecider[],
  itemSpaceId: string | null = null,
): Promise<WorkspaceDecider[]> {
  if (!step || !deciders.length) return deciders;
  const [open] = await openStep(prisma, organizationId, step.kind, step.itemId);
  if (!open) return deciders;
  const left = rolesStillNeeded(open, await stepRules(prisma, organizationId, [step.kind]));
  const earlier = [...new Set([open.firstById, ...open.approverIds])];
  // A step from before its facts were stored: the item's own workspace.
  const spaceIds = parseStoredFacts(open.facts)?.spaceIds ?? (itemSpaceId ? [itemSpaceId] : []);
  const only = deciders.map((d) => d.id);
  const now = new Date();
  // One query per role still needed (usually one or two), asked about these people only — never capped.
  const [holderLists, standIns] = await Promise.all([
    Promise.all(
      left.map((roleId) => roleHolderIds(prisma, { organizationId, roleId, spaceIds, exclude: [], now, only })),
    ),
    standInsAround(prisma, organizationId, earlier, open.firstAt),
  ]);
  const holders = left.map((roleId, i) => ({ roleId, ids: new Set(holderLists[i]) }));
  return deciders.filter(
    (d) =>
      approvalTurn({
        callerId: d.id,
        admin: d.via === 'ADMIN',
        earlier,
        standInOf: earlier.filter((id) => id !== d.id && standInCovers(standIns, d.id, [id], open.firstAt)),
        left,
        heldLeft: holders.filter((h) => h.ids.has(d.id)).map((h) => h.roleId),
      }).waitsForYou,
  );
}
