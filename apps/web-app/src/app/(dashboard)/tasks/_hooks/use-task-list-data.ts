"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { keys } from "@/lib/query-keys"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"
import { tasksApi, phasesApi, sprintsApi, epicsApi, locationsApi } from "@/lib/api"
import { BOARD_FETCH_LIMIT, type TaskScope, type ViewMode } from "../_lib/task-list"

/**
 * Everything the task page reads from the server: the task list (filtered by
 * the SERVER), the counts, the planning lists and the workspaces.
 */
export function useTaskListData({
  activeStatuses,
  debouncedSearch,
  selectedSpaceId,
  scope,
  epicFilter,
  page,
  limit,
  viewMode,
  mineOnly,
}: {
  activeStatuses: string[] | undefined
  debouncedSearch: string
  selectedSpaceId: string | null
  scope: TaskScope
  epicFilter: string
  page: number
  limit: number
  viewMode: ViewMode
  mineOnly: boolean
}) {
  const { user, hasPermission } = useAuth()

  // Board and schedule show the whole workload at once — a kanban column that
  // says "Done 0" because the finished tasks are on page 3 is worse than no
  // count. The table keeps real pagination.
  const paginated = viewMode === "table"
  const effectiveLimit = paginated ? limit : BOARD_FETCH_LIMIT

  // Fetch tasks. Every filter below is applied by the SERVER: filtering in the
  // browser only ever filtered the page that happened to be loaded, so a search
  /*
    Mine, or everything I oversee.

    Only meaningful for somebody who can see more than their own work — a member
    without `canViewAllTasks` already sees only their own, so a scope would be a
    control with one real option.

    Opens on ALL here, unlike the phone. A person at a desk on this screen is
    usually running the board; a person unlocking a phone is usually asking what
    to do next. Same control, different default, because they are different
    questions.
  */
  const canSeeOthers = user?.role === "ADMIN" || hasPermission("canViewAllTasks")

  // missed anything past row 20 and the totals described a different set than
  // the rows did.
  const taskQueryParams = useMemo(
    () => ({
      statuses: activeStatuses,
      search: debouncedSearch,
      spaceId: selectedSpaceId || undefined,
      sprintId: scope === "all" ? undefined : scope === "backlog" ? "none" : scope,
      epicId: epicFilter === "all" ? undefined : epicFilter,
      page: paginated ? page : 1,
      limit: effectiveLimit,
      /*
        Narrowed by the SERVER when the reader asks for their own work.

        The list is paged, so filtering here would filter the page rather than
        the work — and somebody overseeing a busy organization may not have
        their own task in it at all. Never sent by a member who only ever sees
        their own; their list already is that.
      */
      ...(canSeeOthers && mineOnly ? { assignedToMe: true } : {}),
    }),
    [activeStatuses, debouncedSearch, selectedSpaceId, scope, epicFilter, page, paginated, effectiveLimit, canSeeOthers, mineOnly],
  )

  const { data: tasksData, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.tasks.list(taskQueryParams),
    queryFn: () => tasksApi.list(taskQueryParams),
    placeholderData: (prev) => prev, // keep rows on screen while a filter re-fetches
  })

  /*
    How many are mine, and how many there are.

    One cached reply carries both — counting rows the page has not fetched is
    the only way a badge can be true. Asked only of somebody who has a scope to
    switch; for everybody else the list is already the whole answer.
  */
  const { data: myCounts } = useQuery({
    queryKey: keys.tasks.counts(),
    queryFn: () => tasksApi.getStatusCounts(),
    staleTime: 30000,
    enabled: canSeeOthers,
  })

  // Space tab counts, grouped server-side over everything the viewer may see.
  // Computed from the loaded page before, which is why the same tab showed 7 on
  // page 1 and 4 on page 2.
  const { data: spaceCounts } = useQuery({
    queryKey: keys.tasks.counts({ groupBy: "space" }),
    queryFn: () => tasksApi.getStatusCounts({ groupBy: "space" }),
    staleTime: 30000,
  })

  // Fetch phases
  // GET /phases, /sprints, /epics are @RequirePermission('canViewAllTasks'): a member
  // without it got three 403s on every visit to their own task list.
  const { holds } = useRouteAccess()
  const readsPlanning = holds("org:canViewAllTasks")
  const { data: phases } = useQuery({
    queryKey: keys.phases.lists(),
    queryFn: () => phasesApi.list(),
    staleTime: 60000,
    enabled: readsPlanning,
  })

  // Fetch sprints
  const { data: sprints } = useQuery({
    queryKey: keys.sprints.lists(),
    queryFn: () => sprintsApi.list(),
    staleTime: 60000,
    enabled: readsPlanning,
  })

  // Fetch epics
  const { data: epics } = useQuery({
    queryKey: keys.epics.lists(),
    queryFn: () => epicsApi.list(),
    staleTime: 60000,
    enabled: readsPlanning,
  })

  // Fetch spaces (company locations)
  const { data: spacesData } = useQuery({
    queryKey: keys.locations.list(),
    queryFn: () => locationsApi.list(),
    staleTime: 60000,
  })
  const allSpaces = spacesData?.data || []

  // Role-based space filtering:
  // Admin/Dispatcher → all spaces
  // Employee → only spaces from their assigned tasks
  const isAdminOrManager = user?.role === "ADMIN" || hasPermission('canViewAllTasks')
  const spaces = useMemo(() => {
    if (isAdminOrManager) return allSpaces
    // Filter to spaces the employee has tasks in
    const taskList = tasksData?.data || []
    const userSpaceIds = new Set(taskList.filter((t) => t.spaceId).map((t) => t.spaceId))
    if (userSpaceIds.size === 0) return allSpaces
    return allSpaces.filter((s) => userSpaceIds.has(s.id))
  }, [isAdminOrManager, allSpaces, tasksData])

  // Space tab counts — server-grouped over everything visible, not the page.
  const spaceTaskCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [spaceId, n] of Object.entries(spaceCounts ?? {})) {
      if (spaceId !== "all") counts.set(spaceId, n as number)
    }
    return counts
  }, [spaceCounts])

  const tasks = tasksData?.data || []
  const meta = tasksData?.meta

  return {
    canSeeOthers,
    paginated,
    tasks,
    meta,
    isLoading,
    isError,
    error,
    refetch,
    myCounts,
    spaceTaskCounts,
    phases,
    sprints,
    epics,
    spaces,
  }
}
