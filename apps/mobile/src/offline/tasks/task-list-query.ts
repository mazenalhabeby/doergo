/**
 * The task list's server-side filters, applied to the phone's copy.
 *
 * ⚠️ Mirrors TasksService.findAll for the filters the list screen sends, so a
 * list read offline holds the same rows as the one fetched online:
 *  - a due-date window, where `includeNoDueDate` also keeps undated tasks and
 *    overdue ones that are still active (a job due last month is current work)
 *  - `search` on title and description, case-insensitive
 *  - `assignedToMe`: lead OR co-assignee
 */
export interface LocalTaskQuery {
  startDate?: string;
  endDate?: string;
  includeNoDueDate?: boolean;
  search?: string;
  assignedToMe?: boolean;
}

const FINISHED = new Set(['COMPLETED', 'CLOSED', 'CANCELED']);

interface Row {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  dueDate?: string | null;
  assignedToId?: string | null;
  assignees?: { userId?: string; user?: { id: string } }[];
}

/*
  Day boundaries in UTC, because that is what the server computes: it parses
  "YYYY-MM-DD" as UTC midnight and applies setHours in a container running in
  UTC. Using the phone's zone here would move a task due at 01:00 Vienna time on
  the 1st into the wrong month's tab — offline only, which is the worst kind.
*/
function dayStart(d: string): number {
  return Date.parse(`${d.slice(0, 10)}T00:00:00.000Z`);
}
function dayEnd(d: string): number {
  return Date.parse(`${d.slice(0, 10)}T23:59:59.999Z`);
}

export function filterTasksLocally<T extends Row>(rows: readonly T[], q: LocalTaskQuery, userId: string | undefined): T[] {
  const from = q.startDate ? dayStart(q.startDate) : null;
  const to = q.endDate ? dayEnd(q.endDate) : null;
  const needle = q.search?.trim().toLowerCase();

  return rows.filter((t) => {
    if (q.assignedToMe && userId) {
      const mine = t.assignedToId === userId || (t.assignees ?? []).some((a) => (a.userId ?? a.user?.id) === userId);
      if (!mine) return false;
    }

    if (from !== null || to !== null) {
      const due = t.dueDate ? new Date(t.dueDate).getTime() : null;
      const inWindow = due !== null && (from === null || due >= from) && (to === null || due <= to);
      if (!inWindow) {
        if (!q.includeNoDueDate) return false;
        const undated = due === null;
        const overdueActive = due !== null && from !== null && due < from && !FINISHED.has(t.status);
        if (!undated && !overdueActive) return false;
      }
    }

    if (needle) {
      const hay = `${t.title} ${t.description ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}
