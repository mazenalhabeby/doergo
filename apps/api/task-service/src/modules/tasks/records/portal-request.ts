import { portalRequestReference, type SpaceScopeIds } from '@hbcfield/shared';

/**
 * A client request as the office and the client read it, and the workspaces a caller may read
 * requests in — shared by reading (TaskPortalService) and triaging (TaskTriageService).
 */
type When = Date | string;
/** What the portal shows of a request: the three reads (list, triage inbox, one) all include at least this. */
export interface PortalRequestRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  unitId?: string | null;
  unit?: { name: string } | null;
  triaged?: boolean | null;
  spaceId?: string | null;
  space?: { name: string } | null;
  assignedToId?: string | null;
  createdAt: When;
  updatedAt: When;
  workflow?: { statuses: { key: string; name: string; capabilities?: string[] | null }[] } | null;
}

// ============ Customer Portal (customer-scoped reads) ============
// Every query is filtered by BOTH organizationId AND the caller's own
// customerId (passed from the verified token, never the client body) so a
// customer can only ever see their own requests.

export function portalRequestShape(task: PortalRequestRow) {
  const statuses = task.workflow?.statuses ?? [];
  const curIdx = statuses.findIndex((s) => s.key === task.status);
  const timeline = statuses.map((s, i) => ({
    label: s.name,
    state: curIdx < 0 ? 'pending' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending',
  }));
  return {
    id: task.id,
    reference: portalRequestReference(task.id),
    title: task.title,
    status: task.status,
    priority: task.priority,
    unitName: task.unit?.name ?? null,
    unitId: task.unitId ?? null,
    // Triage state (admin inbox): false = pending triage (no space/flow yet).
    triaged: task.triaged ?? true,
    spaceId: task.spaceId ?? null,
    spaceName: task.space?.name ?? null,
    assignedToId: task.assignedToId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    // The client renders live tracking only when the current status enables it.
    tracked: statuses[curIdx]?.capabilities?.includes('gps') ?? false,
    timeline,
  };
}

/**
 * A request's workspace is its PORTAL's — the portal it was RAISED in
 * (`Task.portalId`), never the client's current one — not
 * `Task.spaceId`, which stays empty until triage and then names wherever the
 * work was routed. The office reads a portal's inbox, so reach follows the
 * portal: a request from a portal in a workspace the caller answers for is
 * theirs to read, wherever it was later routed. An organization-level portal
 * (no workspace) is in no list of ids — org-wide key only.
 *
 * undefined/null = org-wide (adds nothing) · [] = nowhere (matches nothing).
 */
export function portalRequestScope(scope: SpaceScopeIds): Record<string, unknown> {
  if (scope === undefined || scope === null) return {};
  return { portal: { spaceId: { in: scope } } };
}
