import type { PrismaService } from './prisma/prisma.service';

/**
 * Which workflow a space uses by default.
 *
 * Four places resolved this independently — task creation, triage, the legacy
 * realign path, and the status-transition fallback — each reading
 * CompanyLocation.workflowId directly. Four copies of one rule is how the
 * status rules drifted apart earlier, so it is stated once here before a second
 * source of truth exists.
 *
 * Reads the SpaceWorkflow join first and falls back to the column. During the
 * migration both are populated and agree; afterwards the column can be dropped
 * without touching any caller.
 */
export async function resolveSpaceDefaultWorkflowId(
  prisma: PrismaService,
  spaceId: string | null | undefined,
): Promise<string | null> {
  if (!spaceId) return null;

  const offered = await prisma.spaceWorkflow.findFirst({
    where: { spaceId, isDefault: true },
    select: { workflowId: true },
  });
  if (offered) return offered.workflowId;

  // No row yet — a space created before the join existed, or one whose
  // offerings were all removed. The column is still authoritative for it.
  const space = await prisma.companyLocation.findUnique({
    where: { id: spaceId },
    select: { workflowId: true },
  });
  return space?.workflowId ?? null;
}

/**
 * Every workflow a space offers, default first.
 *
 * Phase 3 uses this to decide what task creation may choose from. Until then it
 * describes the same single workflow the column does, which is what makes the
 * change from one to many invisible when it lands.
 */
export async function listSpaceWorkflowIds(
  prisma: PrismaService,
  spaceId: string | null | undefined,
): Promise<string[]> {
  if (!spaceId) return [];

  const rows = await prisma.spaceWorkflow.findMany({
    where: { spaceId },
    orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
    select: { workflowId: true },
  });
  if (rows.length > 0) return rows.map((r) => r.workflowId);

  const fallback = await resolveSpaceDefaultWorkflowId(prisma, spaceId);
  return fallback ? [fallback] : [];
}
