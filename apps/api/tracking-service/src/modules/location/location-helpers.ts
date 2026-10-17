// Field-worker roles. Must be valid DB Role enum values: TECHNICIAN was retired
// from the enum (2026-07-16) and asking for it made Prisma refuse the whole
// query — GET /tracking/workers answered 500 for everybody, admins included.
const WORKER_ROLES = ['EMPLOYEE'] as const;

/**
 * The live map held in a WORKSPACE (`canViewTracking` in a space role — an
 * external supervisor running one site, a site manager) shows that workspace
 * and nothing else. Three states, as everywhere (gateway `scopeFor`):
 *
 *   undefined  org-wide — unchanged
 *   [ids]      people rostered there now; routes only of jobs in those spaces
 *   []         granted nowhere — matches nothing
 *
 * ⚠️ A person is often in two workspaces. Their CURRENT position is a fact about
 * the person, and they are in my crew — shown. Their ROUTES and HISTORY are a
 * fact about the work: a drive to a job in another workspace is that
 * workspace's business, so a scoped caller reads only points of jobs in scope.
 * Out of scope answers exactly what "not found" answers (null / []), never an
 * error that would confirm the person or the job exists.
 */
function taskInScope(scopeSpaceIds?: string[]): Record<string, unknown> {
  return scopeSpaceIds === undefined ? {} : { spaceId: { in: scopeSpaceIds } };
}

export { WORKER_ROLES, taskInScope };
