import type { PrismaService } from '@hbcfield/shared';

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
 * The same rule for many spaces at once: two queries, whatever the count.
 *
 * Callers resolving per task asked once per space (and once more for a space with
 * no row) — 26 statements for one employee's clock-out sheet. One default per
 * space is a unique index (`space_workflows_one_default_per_space`), so the batch
 * answers exactly what `resolveSpaceDefaultWorkflowId` answers for each space.
 */
export async function resolveSpaceDefaultWorkflowIds(
  prisma: PrismaService,
  spaceIds: Iterable<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set([...spaceIds].filter((id): id is string => !!id))];
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const offered = await prisma.spaceWorkflow.findMany({
    where: { spaceId: { in: ids }, isDefault: true },
    select: { spaceId: true, workflowId: true },
  });
  for (const row of offered) out.set(row.spaceId, row.workflowId);
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) {
    const spaces = await prisma.companyLocation.findMany({
      where: { id: { in: missing } },
      select: { id: true, workflowId: true },
    });
    const column = new Map(spaces.map((s) => [s.id, s.workflowId ?? null]));
    for (const id of missing) out.set(id, column.get(id) ?? null);
  }
  return out;
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
