"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { keys } from "@/lib/query-keys"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"
import { tasksApi, phasesApi, sprintsApi, epicsApi } from "@/lib/api"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { effectiveSpaceModules } from "@hbcfield/shared/client"
import { BOARD_FETCH_LIMIT, type TaskScope, type ViewMode } from "../_lib/task-list"

const NO_SPACES: never[] = []

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
    How many are mine, how many there are, and how many per workspace.

    ONE reply carries all three: the per-workspace grouping also answers `all`
    and `mine` (task-support getStatusCounts), so the "All / Mine" toggle reads
    it too instead of asking the status grouping the same two numbers.
  */
  const { data: spaceCounts } = useQuery({
    queryKey: keys.tasks.counts({ groupBy: "space" }),
    queryFn: () => tasksApi.getStatusCounts({ groupBy: "space" }),
    staleTime: 30000,
  })
  const myCounts = useMemo(
    () => (canSeeOthers && spaceCounts ? { all: spaceCounts.all, mine: spaceCounts.mine } : undefined),
    [canSeeOthers, spaceCounts],
  )

  /*
    The workspaces — from the shared directory (lib/space-directory), which the
    shell and every row's module check read too. The directory includes archived
    workspaces; the tabs show the active ones, which is what `GET /locations`
    without `includeInactive` answered.
  */
  const { data: directory } = useSpaceDirectory()
  const spacesData = useMemo(
    () => (directory ? { data: directory.filter((s) => s.isActive !== false) } : undefined),
    [directory],
  )

  /*
    Sprints, phases and epics — only where the module is on SOMEWHERE (the
    organization, or any workspace's own list). These lists exist for those
    modules; asking for them in an organization that runs none of them was three
    requests on every visit whose answers nothing drew.

    GET /phases, /sprints, /epics are @RequirePermission('canViewAllTasks'): a
    member without it got three 403s on every visit to their own task list.
  */
  const { holds } = useRouteAccess()
  const readsPlanning = holds("org:canViewAllTasks")
  const moduleInUse = useMemo(() => {
    const on = new Set<string>(user?.orgModules ?? [])
    for (const space of directory ?? []) {
      for (const m of effectiveSpaceModules((space as { enabledModules?: unknown }).enabledModules, user?.orgModules ?? [])) on.add(m)
    }
    return (m: string) => on.has(m)
  }, [directory, user?.orgModules])
  // Until the directory arrives only the organization's own modules can say yes;
  // a workspace that runs the module turns it on when the directory lands.

  const { data: phases } = useQuery({
    queryKey: keys.phases.lists(),
    queryFn: () => phasesApi.list(),
    staleTime: 60000,
    enabled: readsPlanning && moduleInUse("phases"),
  })

  const { data: sprints } = useQuery({
    queryKey: keys.sprints.lists(),
    queryFn: () => sprintsApi.list(),
    staleTime: 60000,
    enabled: readsPlanning && moduleInUse("sprints"),
  })

  const { data: epics } = useQuery({
    queryKey: keys.epics.lists(),
    queryFn: () => epicsApi.list(),
    staleTime: 60000,
    enabled: readsPlanning && moduleInUse("epics"),
  })

  // ⚠️ A STABLE empty list while loading — a fresh `[]` each render changes `spaces`, which the command
  // palette registration depends on (see command-palette-context: that was a render loop).
  const allSpaces = spacesData?.data ?? NO_SPACES

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
