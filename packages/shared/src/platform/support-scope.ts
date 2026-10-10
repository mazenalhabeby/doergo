/**
 * Which support tickets one operator may reach — ONE rule for the inbox (a
 * list `where`) and for every action on a single ticket (a predicate), so a
 * ticket that is missing from somebody's inbox cannot be opened, answered,
 * re-routed or closed by guessing its id.
 *
 * Supervisors (OWNER / CONTROLLER) see everything. Everyone else with
 * `manageSupport` sees: the unassigned triage queue, their teams' queues, and
 * tickets assigned to them personally.
 */
export interface SupportAgentScope {
  isSupervisor: boolean;
  teamIds: string[];
  /** The operator's platform user id — what `assignedAgentId` now holds. */
  platformUserId?: string | null;
}

/** Normalise whatever arrived over the bus. Absent or malformed = the narrowest scope. */
export function normalizeSupportScope(raw: unknown): SupportAgentScope {
  const r = (raw ?? {}) as Partial<SupportAgentScope>;
  return {
    isSupervisor: r.isSupervisor === true,
    teamIds: Array.isArray(r.teamIds) ? r.teamIds.filter((t): t is string => typeof t === 'string' && !!t) : [],
    platformUserId: typeof r.platformUserId === 'string' && r.platformUserId ? r.platformUserId : null,
  };
}

/** The list filter, or `null` for "no restriction" (a supervisor). */
export function supportScopeWhere(scope: SupportAgentScope): { OR: Record<string, unknown>[] } | null {
  if (scope.isSupervisor) return null;
  return {
    OR: [
      { assignedTeamId: null },
      ...(scope.teamIds.length ? [{ assignedTeamId: { in: scope.teamIds } }] : []),
      ...(scope.platformUserId ? [{ assignedAgentId: scope.platformUserId }] : []),
    ],
  };
}

/** The same rule asked of one ticket. */
export function ticketInSupportScope(
  ticket: { assignedTeamId?: string | null; assignedAgentId?: string | null },
  scope: SupportAgentScope,
): boolean {
  if (scope.isSupervisor) return true;
  if (!ticket.assignedTeamId) return true;
  if (scope.teamIds.includes(ticket.assignedTeamId)) return true;
  return !!scope.platformUserId && ticket.assignedAgentId === scope.platformUserId;
}
